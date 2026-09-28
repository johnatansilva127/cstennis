import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays, admin, createLinkedAdult, createLocation, createSeries, orgToday, processOutbox, rpc, rpcError, setupOrg, sql,
  type Org, type Session,
} from "../helpers/db";
import { randomUUID, createHash } from "node:crypto";

const SHA = createHash("sha256").update("comprovante").digest("hex");

async function submitProof(session: Session, invoiceId: string, scan: "clean" | "pending" | "infected" = "clean") {
  const begin = await rpc<{ submission_id: string; file_id: string }>(session, "begin_payment_submission", {
    p_invoice_id: invoiceId, p_detected_type: "png", p_mime_type: "image/png", p_size_bytes: 2048, p_sha256: SHA,
    p_width: 800, p_height: 600, p_note: "Pago pelo app do banco" });
  const status = await rpc<string>(admin, "complete_payment_submission_upload", {
    p_file_id: begin.file_id, p_scan_status: scan, p_scan_engine: "teste" });
  return { ...begin, status };
}

async function invoiceOf(studentId: string) {
  return (await sql<{ id: string; status: string; amount_cents: number; due_date: string }>(
    "select id, status, amount_cents, due_date::text from public.invoices where student_id = $1 order by competence limit 1", [studentId]))[0];
}

describe("Financeiro (critérios 9 a 12)", () => {
  let org: Org;
  let today: string;

  beforeAll(async () => {
    org = await setupOrg();
    today = await orgToday(org.orgId);
  });

  it("vencimento em dias 29–31 usa o último dia de meses menores (inclui fevereiro bissexto)", async () => {
    const cases: [string, number, string][] = [
      ["2027-02-01", 31, "2027-02-28"], ["2027-02-01", 29, "2027-02-28"], ["2028-02-01", 30, "2028-02-29"],
      ["2028-02-01", 29, "2028-02-29"], ["2026-04-01", 31, "2026-04-30"], ["2026-12-01", 31, "2026-12-31"],
      ["2026-11-01", 15, "2026-11-15"],
    ];
    for (const [comp, day, expected] of cases) {
      const rows = await sql<{ d: string }>("select private.due_date_for($1::date, $2)::text as d", [comp, day]);
      expect(rows[0].d, `${comp} dia ${day}`).toBe(expected);
    }
  });

  it("job de cobrança é idempotente, respeita competência, antecedência, pausa e snapshots (critério 9)", async () => {
    const { student_id } = await rpc<{ student_id: string }>(org.coach, "create_student", {
      p_payload: { full_name: "Aluno Cobrança", kind: "adult", phone: "11988887777" } });
    await rpc(org.coach, "set_tuition_term", {
      p_student_id: student_id, p_amount_cents: 32000, p_due_day: 31, p_starts_month: "2027-01-01" });
    const run = (d: string) => sql("select * from private.generate_invoices($1, $2::date)", [org.orgId, d]);
    const invoices = () => sql<{ competence: string; due_date: string; amount_cents: number }>(
      "select competence::text, due_date::text, amount_cents from public.invoices where student_id = $1 order by competence", [student_id]);

    await run("2027-01-20"); // 31/01 - 10 dias = 21/01: ainda não
    expect(await invoices()).toEqual([]);
    for (let i = 0; i < 3; i++) await run("2027-01-21");
    expect(await invoices()).toEqual([{ competence: "2027-01-01", due_date: "2027-01-31", amount_cents: 32000 }]);
    for (let i = 0; i < 3; i++) await run("2027-02-18");
    expect(await invoices()).toHaveLength(2);
    expect((await invoices())[1]).toEqual({ competence: "2027-02-01", due_date: "2027-02-28", amount_cents: 32000 });

    // Reajuste a partir de março não altera cobranças emitidas (snapshot).
    await sql("update public.tuition_terms set starts_month = starts_month where student_id = $1", [student_id]);
    await rpc(org.coach, "set_tuition_term", {
      p_student_id: student_id, p_amount_cents: 35000, p_due_day: 31, p_starts_month: "2027-03-01" });
    await run("2027-03-25");
    const afterRaise = await invoices();
    expect(afterRaise.map((i) => i.amount_cents)).toEqual([32000, 32000, 35000]);

    // Pausa a partir de abril: sem novas cobranças; março permanece.
    await sql(
      "insert into public.student_status_changes (organization_id, student_id, status, effective_date, reason) values ($1, $2, 'paused', '2027-04-01', 'viagem')",
      [org.orgId, student_id]);
    await run("2027-04-25");
    await run("2027-05-25");
    expect(await invoices()).toHaveLength(3);
    // Cobrança cancelada não é recriada pelo job.
    const mar = (await sql<{ id: string }>("select id from public.invoices where student_id = $1 and competence = '2027-03-01'", [student_id]))[0];
    await rpc(org.coach, "cancel_invoice", { p_invoice_id: mar.id, p_reason: "Isenção combinada" });
    await run("2027-03-26");
    expect((await sql("select * from public.invoices where student_id = $1 and competence = '2027-03-01'", [student_id]))).toHaveLength(1);
  });

  it("data local e virada de dia/mês usam America/Sao_Paulo", async () => {
    const cases: [string, string][] = [
      ["2026-10-01T02:59:00Z", "2026-09-30"], ["2026-10-01T03:00:00Z", "2026-10-01"],
      ["2027-01-01T02:30:00Z", "2026-12-31"], ["2027-03-01T03:00:00Z", "2027-03-01"],
    ];
    for (const [instant, expected] of cases) {
      const rows = await sql<{ d: string }>("select private.local_date_at($1, $2::timestamptz)::text as d", [org.orgId, instant]);
      expect(rows[0].d, instant).toBe(expected);
    }
    const inst = await sql<{ t: string }>(
      "select to_char(private.local_instant('2026-10-05', '07:00', 'America/Sao_Paulo') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as t");
    expect(inst[0].t).toBe("2026-10-05 10:00");

    // Bloqueio passa a valer no dia seguinte ao vencimento (data local).
    const { student_id } = await rpc<{ student_id: string }>(org.coach, "create_student", {
      p_payload: { full_name: "Aluno Fuso", kind: "adult", phone: "11977776666" } });
    await rpc(org.coach, "create_manual_invoice", {
      p_student_id: student_id, p_competence: "2026-09-01", p_amount_cents: 10000, p_due_date: "2026-09-30", p_reason: "Teste de fuso" });
    await rpc(org.coach, "set_access_policy", { p_student_id: student_id, p_mode: "block_requests", p_grace_days: 0 });
    const level = async (instant: string) => (await sql<{ level: string }>(
      "select level from private.compute_restriction($1, private.local_date_at($2, $3::timestamptz))",
      [student_id, org.orgId, instant]))[0].level;
    expect(await level("2026-10-01T02:59:00Z")).toBe("none");         // ainda 30/09 em SP
    expect(await level("2026-10-01T03:00:00Z")).toBe("block_requests"); // 01/10 em SP
  });

  it("upload não confirma pagamento; rejeição permite reenvio; aprovação duplicada não duplica receita (critério 10)", async () => {
    const s = await createLinkedAdult(org, { tuition: { amount_cents: 28000, due_day: 28 } });
    await rpc(org.coach, "generate_invoices_now");
    const inv = await invoiceOf(s.studentId);
    expect(inv.status).toBe("open");

    const first = await submitProof(s.session, inv.id);
    expect(first.status).toBe("received");
    expect((await invoiceOf(s.studentId)).status).toBe("under_review");
    expect(await sql("select * from public.payments where invoice_id = $1", [inv.id])).toEqual([]);
    const summary = await rpc<{ received_cents: number; under_review_cents: number }>(org.coach, "finance_summary", {
      p_from_month: today, p_to_month: today, p_student_id: s.studentId });
    expect(summary.received_cents).toBe(0);
    expect(summary.under_review_cents).toBe(28000);

    // Segundo envio enquanto há um em análise é recusado.
    const dup = await rpcError(s.session, "begin_payment_submission", {
      p_invoice_id: inv.id, p_detected_type: "pdf", p_mime_type: "application/pdf", p_size_bytes: 10, p_sha256: SHA });
    expect(dup.code).toBe("CS409");

    await rpc(org.coach, "review_payment_submission", { p_submission_id: first.submission_id, p_action: "reject",
      p_reason: "Valor do comprovante diferente da mensalidade" });
    expect((await invoiceOf(s.studentId)).status).toBe("open");
    const { data: subs } = await s.session.client.from("payment_submissions").select("status, rejection_reason");
    expect(subs).toEqual([{ status: "rejected", rejection_reason: "Valor do comprovante diferente da mensalidade" }]);

    const second = await submitProof(s.session, inv.id);
    const results = await Promise.all([
      rpc<string>(org.coach, "review_payment_submission", { p_submission_id: second.submission_id, p_action: "approve" }),
      rpc<string>(org.coach, "review_payment_submission", { p_submission_id: second.submission_id, p_action: "approve" }),
    ]);
    expect(results[0]).toBe(results[1]);
    const payments = await sql<{ amount_cents: number }>("select amount_cents from public.payments where invoice_id = $1", [inv.id]);
    expect(payments).toEqual([{ amount_cents: 28000 }]);
    expect((await invoiceOf(s.studentId)).status).toBe("paid");

    // Nova quitação é impedida.
    const manual = await rpcError(org.coach, "record_manual_payment", {
      p_invoice_id: inv.id, p_amount_cents: 28000, p_paid_on: today, p_method: "cash", p_justification: "Recebi em mãos" });
    expect(manual.code).toBe("CS409");
    const late = await rpcError(s.session, "begin_payment_submission", {
      p_invoice_id: inv.id, p_detected_type: "png", p_mime_type: "image/png", p_size_bytes: 10, p_sha256: SHA });
    expect(late.code).toBe("CS409");
    const after = await rpc<{ received_cents: number }>(org.coach, "finance_summary", {
      p_from_month: today, p_to_month: today, p_student_id: s.studentId });
    expect(after.received_cents).toBe(28000);
  });

  it("baixa manual exige valor integral, justificativa e é idempotente por chave", async () => {
    const s = await createLinkedAdult(org, { tuition: { amount_cents: 15000, due_day: 15 } });
    await rpc(org.coach, "generate_invoices_now");
    const inv = await invoiceOf(s.studentId);
    const partial = await rpcError(org.coach, "record_manual_payment", {
      p_invoice_id: inv.id, p_amount_cents: 10000, p_paid_on: today, p_method: "cash", p_justification: "Parcial" });
    expect(partial.code).toBe("CS422");
    const key = randomUUID();
    const [p1, p2] = await Promise.all([1, 2].map(() => rpc<string>(org.coach, "record_manual_payment", {
      p_invoice_id: inv.id, p_amount_cents: 15000, p_paid_on: today, p_method: "cash",
      p_justification: "Pagamento em dinheiro na quadra", p_idempotency_key: key })).map((p) => p.catch((e) => String(e))));
    const ids = [p1, p2].filter((x) => !x.startsWith("Error"));
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const rows = await sql("select id from public.payments where invoice_id = $1", [inv.id]);
    expect(rows).toHaveLength(1);
  });

  it("estorno preserva trilha e recalcula indicadores e restrições (critério 11)", async () => {
    const s = await createLinkedAdult(org, { tuition: { amount_cents: 20000, due_day: 5 } });
    await rpc(org.coach, "generate_invoices_now");
    const inv = await invoiceOf(s.studentId);
    await sql("update public.invoices set due_date = $2::date - 10 where id = $1", [inv.id, today]);
    await rpc(org.coach, "set_access_policy", { p_student_id: s.studentId, p_mode: "block_requests", p_grace_days: 0 });
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("block_requests");

    const payment = await rpc<string>(org.coach, "record_manual_payment", {
      p_invoice_id: inv.id, p_amount_cents: 20000, p_paid_on: today, p_method: "pix", p_justification: "Conferido no extrato" });
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("none");

    const err = await rpcError(org.coach, "reverse_payment", { p_payment_id: payment, p_reason: "x" });
    expect(err.code).toBe("CS422");
    await rpc(org.coach, "reverse_payment", { p_payment_id: payment, p_reason: "Pix devolvido pelo banco" });
    const again = await rpcError(org.coach, "reverse_payment", { p_payment_id: payment, p_reason: "Pix devolvido pelo banco" });
    expect(again.code).toBe("CS409");

    const pay = (await sql<{ reversed_at: string | null }>("select reversed_at from public.payments where id = $1", [payment]))[0];
    expect(pay.reversed_at).not.toBeNull();
    expect(await sql("select reason from public.payment_reversals where payment_id = $1", [payment]))
      .toEqual([{ reason: "Pix devolvido pelo banco" }]);
    expect((await invoiceOf(s.studentId)).status).toBe("open");
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("block_requests");
    const summary = await rpc<{ received_cents: number; reversed_count: number; reversed_cents: number }>(org.coach, "finance_summary", {
      p_from_month: addDays(today, -40), p_to_month: today, p_student_id: s.studentId });
    expect(summary).toMatchObject({ received_cents: 0, reversed_count: 1, reversed_cents: 20000 });
    const audit = await sql<{ action: string }>(
      "select action from public.audit_events where entity_id = $1 order by id", [payment]);
    expect(audit.map((a) => a.action)).toEqual(["payment.manual", "payment.reverse"]);

    // Registros financeiros não podem ser apagados nem alterados, nem pelo dono do banco sem desligar travas.
    await expect(sql("delete from public.payments where id = $1", [payment])).rejects.toThrow(/estorno/);
    await expect(sql("update public.payments set amount_cents = 1 where id = $1", [payment])).rejects.toThrow();
    await expect(sql("delete from public.audit_events where entity_id = $1", [payment])).rejects.toThrow(/imutáveis/);

    // Pode pagar novamente após o estorno.
    await rpc(org.coach, "record_manual_payment", {
      p_invoice_id: inv.id, p_amount_cents: 20000, p_paid_on: today, p_method: "pix", p_justification: "Novo Pix confirmado" });
    expect((await invoiceOf(s.studentId)).status).toBe("paid");
  });

  it("step-up desativado (D18): ações sensíveis não exigem MFA", async () => {
    // Antes lançava CS428 para sessão sem TOTP recente; agora não lança.
    await expect(sql(
      "select set_config('request.jwt.claims', $1, true), private.require_recent_mfa()",
      [JSON.stringify({ aal: "aal1", amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })],
    )).resolves.toHaveLength(1);
  });

  it("restrições valem pela API sem impedir regularização; liberação temporária expira (critério 12)", async () => {
    const { locationId } = await createLocation(org);
    const series = await createSeries(org, {
      weekday: 2, start_time: "16:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 5, location_id: locationId });
    const s = await createLinkedAdult(org, { tuition: { amount_cents: 18000, due_day: 1 }, enrollments: [{ series_id: series }] });
    await rpc(org.coach, "generate_invoices_now");
    const inv = await invoiceOf(s.studentId);
    await sql("update public.invoices set due_date = $2::date - 3 where id = $1", [inv.id, today]);

    // Tolerância de 5 dias: apenas aviso.
    await rpc(org.coach, "set_access_policy", { p_student_id: s.studentId, p_mode: "restrict_modules", p_grace_days: 5 });
    const warn = await rpc<{ level: string; effective_from: string }>(s.session, "student_restriction", { p_student_id: s.studentId });
    expect(warn.level).toBe("warn");
    expect(warn.effective_from).toBe(addDays(today, 3));

    // Sem tolerância: módulos restritos pela API, regularização liberada.
    await rpc(org.coach, "set_access_policy", { p_student_id: s.studentId, p_mode: "restrict_modules", p_grace_days: 0 });
    for (const [fn, args] of [
      ["student_lessons", { p_student_id: s.studentId, p_from: today, p_to: addDays(today, 7) }],
      ["attendance_summary", { p_student_id: s.studentId, p_from: today, p_to: today }],
      ["list_available_slots", { p_student_id: s.studentId }],
      ["match_stats", { p_student_id: s.studentId, p_from: today, p_to: today }],
      ["save_match", { p_match_id: null, p_student_id: s.studentId, p_payload: { played_on: today, opponent_name: "X", format: "custom", manual_outcome: "win" } }],
    ] as const) {
      expect((await rpcError(s.session, fn, args as Record<string, unknown>)).code, fn).toBe("CS423");
    }
    const { data: enr } = await s.session.client.from("enrollments").select("id");
    expect(enr).toEqual([]);
    const { data: invs } = await s.session.client.from("invoices").select("id");
    expect(invs!.length).toBeGreaterThanOrEqual(1); // mês atual (+ próximo, conforme antecedência)
    const proof = await submitProof(s.session, inv.id);
    expect(proof.status).toBe("received");
    // Envio de comprovante não suspende o bloqueio.
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("restrict_modules");
    // Matrícula não é removida automaticamente.
    expect(await sql("select id from public.enrollments where student_id = $1 and status = 'active'", [s.studentId])).toHaveLength(1);

    // Liberação temporária com prazo e motivo.
    const override = await rpc<string>(org.coach, "create_access_override", {
      p_student_id: s.studentId, p_kind: "release", p_reason: "Conferindo comprovante no banco",
      p_expires_at: new Date(Date.now() + 3600_000).toISOString() });
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("warn");
    await rpc(s.session, "student_lessons", { p_student_id: s.studentId, p_from: today, p_to: addDays(today, 7) });
    // Expira: volta a restringir.
    await sql("update public.access_overrides set starts_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' where id = $1", [override]);
    expect((await rpcError(s.session, "student_lessons", { p_student_id: s.studentId, p_from: today, p_to: today })).code).toBe("CS423");

    // Aprovação recalcula considerando as demais pendências.
    await rpc(org.coach, "review_payment_submission", { p_submission_id: proof.submission_id, p_action: "approve" });
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("none");

    // Bloqueio manual sem dívida (com motivo) e sua revogação.
    const block = await rpc<string>(org.coach, "create_access_override", {
      p_student_id: s.studentId, p_kind: "block_requests", p_reason: "Combinado com o aluno", p_expires_at: null });
    expect((await rpcError(s.session, "request_enrollment", { p_student_id: s.studentId, p_series_id: series })).code).toBe("CS423");
    await rpc(org.coach, "revoke_access_override", { p_override_id: block, p_reason: "Resolvido" });
    expect((await rpc<{ level: string }>(s.session, "student_restriction", { p_student_id: s.studentId })).level).toBe("none");

    await processOutbox();
    const { data: notes } = await s.session.client.from("notifications").select("title");
    expect(notes!.map((n) => n.title)).toEqual(expect.arrayContaining(["Pagamento confirmado"]));
  });
});
