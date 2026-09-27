import { beforeAll, describe, expect, it } from "vitest";
import {
  createLinkedAdult, createLinkedChild, createLocation, createSeries, orgToday, processOutbox, rpc, setupOrg, sql,
  type Org, type Session,
} from "../helpers/db";

describe("Notificações (critério 14)", () => {
  let org: Org;
  let a: { studentId: string; session: Session };
  let b: { studentId: string; session: Session };
  let child: { studentId: string; guardianId: string; session?: Session };
  let today: string;

  beforeAll(async () => {
    org = await setupOrg();
    today = await orgToday(org.orgId);
    a = await createLinkedAdult(org, { tuition: { amount_cents: 10000, due_day: 28 } });
    b = await createLinkedAdult(org);
    child = await createLinkedChild(org);
    await rpc(org.coach, "set_tuition_term", {
      p_student_id: child.studentId, p_amount_cents: 9000, p_due_day: 28, p_starts_month: today.slice(0, 8) + "01" });
  });

  it("avisos chegam só aos vinculados, sem duplicar em retries", async () => {
    await rpc(org.coach, "generate_invoices_now");
    await rpc(org.coach, "generate_invoices_now"); // repetição não gera nova cobrança nem novo evento
    await processOutbox();
    await processOutbox();
    const notesA = (await a.session.client.from("notifications").select("title, body, student_id, link_path")).data!;
    expect(notesA.filter((n) => n.title === "Nova mensalidade")).toHaveLength(1);
    expect(notesA.every((n) => n.student_id === a.studentId)).toBe(true);
    const notesB = (await b.session.client.from("notifications").select("title")).data!;
    expect(notesB.filter((n) => n.title === "Nova mensalidade")).toHaveLength(0);

    // Financeiro da criança vai para o responsável, identificando o filho.
    const g = (await child.session!.client.from("notifications").select("title, body, link_path")).data!;
    const inv = g.find((n) => n.title === "Nova mensalidade")!;
    expect(inv.body.startsWith("Criança")).toBe(true);
    expect(inv.link_path).toContain(`aluno=${child.studentId}`);

    // Nenhum aviso contém valores monetários (dados desnecessários).
    for (const n of [...notesA, ...g]) expect(n.body).not.toMatch(/R\$|\d{3,},\d{2}/);
  });

  it("evento reemitido com a mesma chave é deduplicado e reprocessamento não duplica", async () => {
    await sql("select private.emit($1, 'assessment_published', $2::jsonb, 'dedupe-test-1')",
      [org.orgId, JSON.stringify({ student_id: a.studentId, assessment_id: a.studentId })]);
    await sql("select private.emit($1, 'assessment_published', $2::jsonb, 'dedupe-test-1')",
      [org.orgId, JSON.stringify({ student_id: a.studentId, assessment_id: a.studentId })]);
    await processOutbox();
    // Força reprocessamento do mesmo evento (simula retry após falha parcial).
    await sql("update private.outbox_events set status = 'pending' where dedupe_key = 'dedupe-test-1'");
    await processOutbox();
    const rows = await sql<{ n: string }>(
      "select count(*) n from public.notifications n join private.outbox_events e on e.id = n.event_id where e.dedupe_key = 'dedupe-test-1'");
    expect(Number(rows[0].n)).toBe(1);
  });

  it("falha de evento tem retry limitado e não bloqueia os demais", async () => {
    await sql("select private.emit($1, 'tipo_inexistente', '{}'::jsonb, 'broken-1')", [org.orgId]);
    await sql("select private.emit($1, 'enrollment_created', $2::jsonb, 'ok-after-broken')",
      [org.orgId, JSON.stringify({ student_id: b.studentId, enrollment_id: b.studentId })]);
    for (let i = 0; i < 6; i++) {
      await sql("update private.outbox_events set next_attempt_at = now() where dedupe_key = 'broken-1' and status = 'pending'");
      await processOutbox();
    }
    const broken = await sql<{ status: string; attempts: number }>(
      "select status, attempts from private.outbox_events where dedupe_key = 'broken-1'");
    expect(broken[0]).toEqual({ status: "failed", attempts: 5 });
    const ok = await sql<{ status: string }>("select status from private.outbox_events where dedupe_key = 'ok-after-broken'");
    expect(ok[0].status).toBe("done");
  });

  it("vínculo revogado deixa de receber avisos; usuário só marca os próprios como lidos", async () => {
    const { locationId } = await createLocation(org);
    const series = await createSeries(org, {
      weekday: 4, start_time: "09:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 4, location_id: locationId });
    await rpc(org.coach, "create_enrollment", { p_student_id: child.studentId, p_series_id: series, p_valid_from: today });
    const link = (await sql<{ id: string }>(
      "select id from public.guardian_student_links where student_id = $1 and revoked_at is null", [child.studentId]))[0];
    await rpc(org.coach, "unlink_guardian_student", { p_link_id: link.id, p_reason: "Guarda alterada" });
    await processOutbox();
    const g = (await child.session!.client.from("notifications").select("title")).data!;
    expect(g.map((n) => n.title)).not.toContain("Nova vaga fixa");

    const aIds = (await a.session.client.from("notifications").select("id")).data!.map((n) => n.id);
    const marked = await rpc<number>(b.session, "mark_notifications_read", { p_ids: aIds });
    expect(marked).toBe(0);
    const stillUnread = await sql<{ n: string }>(
      "select count(*) n from public.notifications where id = any($1::uuid[]) and read_at is null", [aIds]);
    expect(Number(stillUnread[0].n)).toBe(aIds.length);
  });
});
