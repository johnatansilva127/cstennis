import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays, admin, createLinkedAdult, createLinkedChild, createLocation, createSeries, nextWeekday, orgToday,
  rpc, rpcError, setupOrg, sql, type Org, type Session,
} from "../helpers/db";

const PROTECTED_TABLES = [
  "students", "student_private_notes", "student_status_changes", "guardians", "guardian_student_links",
  "student_user_links", "invitations", "enrollments", "enrollment_requests", "attendance", "lesson_occurrences",
  "recurring_slots", "tuition_terms", "invoices", "file_objects", "payment_submissions", "payments",
  "payment_reversals", "access_policies", "access_overrides", "assessments", "assessment_scores",
  "assessment_private_notes", "goals", "student_matches", "match_sets", "match_coach_comments",
  "notifications", "audit_events", "privacy_requests", "unavailability_periods",
];

describe("Isolamento de dados (critérios 3, 4 e 5)", () => {
  let org: Org;
  let otherOrg: Org;
  let a: { studentId: string; session: Session };
  let b: { studentId: string; session: Session };
  let child1: { studentId: string; guardianId: string; session?: Session };
  let child2: { studentId: string; guardianId: string; session?: Session };
  let seriesId: string;
  let today: string;

  beforeAll(async () => {
    org = await setupOrg();
    otherOrg = await setupOrg();
    today = await orgToday(org.orgId);
    const { locationId, courtId } = await createLocation(org);
    seriesId = await createSeries(org, {
      weekday: 3, start_time: "18:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 6,
      location_id: locationId, court_id: courtId,
    });
    a = await createLinkedAdult(org, { tuition: { amount_cents: 25000, due_day: 10 }, enrollments: [{ series_id: seriesId }] });
    b = await createLinkedAdult(org, { tuition: { amount_cents: 30000, due_day: 5 }, enrollments: [{ series_id: seriesId }] });
    child1 = await createLinkedChild(org);
    child2 = await createLinkedChild(org, { guardianId: child1.guardianId });
    // Dados privados de B.
    await rpc(org.coach, "set_student_private_note", { p_student_id: b.studentId, p_note: "Observação privada de B" });
    await rpc(org.coach, "set_tuition_term", {
      p_student_id: child1.studentId, p_amount_cents: 20000, p_due_day: 10, p_starts_month: today.slice(0, 8) + "01" });
    await rpc(org.coach, "set_tuition_term", {
      p_student_id: child2.studentId, p_amount_cents: 20000, p_due_day: 10, p_starts_month: today.slice(0, 8) + "01" });
    await rpc(org.coach, "generate_invoices_now");
    const assessment = await rpc<string>(org.coach, "save_assessment", {
      p_assessment_id: null, p_student_id: b.studentId,
      p_payload: { summary: "Feedback de B", private_note: "Nota privada do professor", scores: { forehand: { score: 4 } } },
    });
    await rpc(org.coach, "publish_assessment", { p_assessment_id: assessment });
    await rpc(b.session, "save_match", {
      p_match_id: null, p_student_id: b.studentId,
      p_payload: { played_on: today, opponent_name: "Rival", format: "best_of_3",
        sets: [{ player_games: 6, opponent_games: 3 }, { player_games: 6, opponent_games: 4 }] },
    });
  });

  it("aluno A só enxerga as próprias linhas em todas as tabelas protegidas", async () => {
    for (const table of PROTECTED_TABLES) {
      const { data, error } = await a.session.client.from(table).select("*");
      expect(error, table).toBeNull();
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        if ("student_id" in r && r.student_id) expect(r.student_id, table).toBe(a.studentId);
        if (table === "students") expect(r.id).toBe(a.studentId);
      }
    }
    for (const table of ["student_private_notes", "assessment_private_notes", "invitations", "audit_events",
      "access_policies", "access_overrides", "lesson_occurrences", "recurring_slots", "student_status_changes"]) {
      const { data } = await a.session.client.from(table).select("*");
      expect(data, table).toEqual([]);
    }
  });

  it("aluno A não acessa dados de B alterando IDs em consultas e RPCs", async () => {
    const { data: direct } = await a.session.client.from("students").select("*").eq("id", b.studentId);
    expect(direct).toEqual([]);
    const { data: inv } = await a.session.client.from("invoices").select("*").eq("student_id", b.studentId);
    expect(inv).toEqual([]);
    const { data: matches } = await a.session.client.from("student_matches").select("*").eq("student_id", b.studentId);
    expect(matches).toEqual([]);

    const bInvoice = (await sql<{ id: string }>("select id from public.invoices where student_id = $1", [b.studentId]))[0];
    for (const [fn, args] of [
      ["attendance_summary", { p_student_id: b.studentId, p_from: "2020-01-01", p_to: "2030-01-01" }],
      ["student_lessons", { p_student_id: b.studentId, p_from: today, p_to: addDays(today, 30) }],
      ["list_available_slots", { p_student_id: b.studentId }],
      ["match_stats", { p_student_id: b.studentId, p_from: "2020-01-01", p_to: "2030-01-01" }],
      ["student_restriction", { p_student_id: b.studentId }],
      ["payment_instructions", { p_invoice_id: bInvoice.id }],
      ["export_student_data", { p_student_id: b.studentId }],
      ["request_enrollment", { p_student_id: b.studentId, p_series_id: seriesId }],
      ["begin_payment_submission", { p_invoice_id: bInvoice.id, p_detected_type: "png", p_mime_type: "image/png",
        p_size_bytes: 100, p_sha256: "a".repeat(64) }],
      ["save_match", { p_match_id: null, p_student_id: b.studentId, p_payload: { played_on: today, opponent_name: "X", format: "custom", manual_outcome: "win" } }],
    ] as const) {
      const err = await rpcError(a.session, fn, args as Record<string, unknown>);
      expect(err.code, fn).toBe("CS404");
    }
  });

  it("aluno não consegue alterar role, mensalidade, presença, pagamento ou avaliação (critério 5)", async () => {
    // Escrita direta em tabelas é negada (sem grants / sem políticas de escrita).
    const attempts = [
      a.session.client.from("organization_memberships").update({ role: "coach" }).eq("user_id", a.session.userId),
      a.session.client.from("organization_memberships").insert({ organization_id: org.orgId, user_id: a.session.userId, role: "coach" }),
      a.session.client.from("tuition_terms").update({ amount_cents: 1 }).eq("student_id", a.studentId),
      a.session.client.from("invoices").update({ status: "paid" }).eq("student_id", a.studentId),
      a.session.client.from("payments").insert({ invoice_id: "00000000-0000-0000-0000-000000000000" }),
      a.session.client.from("attendance").insert({ student_id: a.studentId, status: "present" }),
      a.session.client.from("assessments").update({ summary: "hack" }).eq("student_id", a.studentId),
      a.session.client.from("user_profiles").update({ full_name: "x" }).eq("user_id", a.session.userId),
    ];
    for (const q of attempts) {
      const { error } = await q;
      expect(error?.code).toBe("42501");
    }
    // RPCs de professor exigem papel de professor com MFA.
    const coachOnly: [string, Record<string, unknown>][] = [
      ["set_tuition_term", { p_student_id: a.studentId, p_amount_cents: 1, p_due_day: 1, p_starts_month: today }],
      ["save_attendance", { p_occurrence_id: "00000000-0000-0000-0000-000000000000", p_marks: [] }],
      ["record_manual_payment", { p_invoice_id: "00000000-0000-0000-0000-000000000000", p_amount_cents: 1, p_paid_on: today, p_method: "pix", p_justification: "hack" }],
      ["save_assessment", { p_assessment_id: null, p_student_id: a.studentId, p_payload: {} }],
      ["create_access_override", { p_student_id: a.studentId, p_kind: "release", p_reason: "hack", p_expires_at: null }],
      ["update_pix_settings", { p_receiver_name: "Hacker", p_key_type: "email", p_pix_key: "h@example.test", p_city: "SP", p_brcode_enabled: false }],
      ["create_student", { p_payload: { full_name: "X", kind: "adult", email: "x@example.test" } }],
    ];
    for (const [fn, args] of coachOnly) {
      const err = await rpcError(a.session, fn, args);
      expect(["CS403", "CS404"], fn).toContain(err.code);
    }
    // Service-only RPCs não são executáveis por usuários.
    const err = await rpcError(a.session, "bootstrap_coach", { p_org_name: "X", p_user_id: a.session.userId, p_timezone: "America/Sao_Paulo" });
    expect(err.code).toBe("42501");
    const err2 = await rpcError(a.session, "complete_payment_submission_upload", { p_file_id: "00000000-0000-0000-0000-000000000000", p_scan_status: "clean", p_scan_engine: "x" });
    expect(err2.code).toBe("42501");
    const roles = await sql<{ role: string }>("select role from public.organization_memberships where user_id = $1", [a.session.userId]);
    expect(roles.map((r) => r.role)).toEqual(["participant"]);
  });

  it("aluno não edita comentário do professor e não vê avaliação privada/rascunho", async () => {
    const draft = await rpc<string>(org.coach, "save_assessment", {
      p_assessment_id: null, p_student_id: a.studentId, p_payload: { summary: "Rascunho", scores: { serve: { score: 2 } } } });
    const { data } = await a.session.client.from("assessments").select("id").eq("id", draft);
    expect(data).toEqual([]);
    const { data: scores } = await a.session.client.from("assessment_scores").select("*").eq("assessment_id", draft);
    expect(scores).toEqual([]);
  });

  it("responsável acessa apenas filhos vinculados; revogação remove o acesso", async () => {
    const guardian = child1.session!;
    const { data: visible } = await guardian.client.from("students").select("id").order("id");
    expect(visible!.map((r) => r.id).sort()).toEqual([child1.studentId, child2.studentId].sort());
    const { data: other } = await guardian.client.from("students").select("id").eq("id", a.studentId);
    expect(other).toEqual([]);

    // Responsável não cria vínculo arbitrário: não há RPC para isso fora do professor.
    const err = await rpcError(guardian, "link_guardian_student", {
      p_guardian_id: child1.guardianId, p_student_id: a.studentId, p_relationship: null });
    expect(["CS403", "CS404"]).toContain(err.code);

    const link = (await sql<{ id: string }>(
      "select id from public.guardian_student_links where guardian_id = $1 and student_id = $2 and revoked_at is null",
      [child1.guardianId, child2.studentId]))[0];
    await rpc(org.coach, "unlink_guardian_student", { p_link_id: link.id, p_reason: "Teste de revogação" });
    const { data: after } = await guardian.client.from("students").select("id");
    expect(after!.map((r) => r.id)).toEqual([child1.studentId]);
    const { data: inv } = await guardian.client.from("invoices").select("id").eq("student_id", child2.studentId);
    expect(inv).toEqual([]);
    const e2 = await rpcError(guardian, "student_restriction", { p_student_id: child2.studentId });
    expect(e2.code).toBe("CS404");
    // Restaura para os próximos testes.
    await rpc(org.coach, "link_guardian_student", { p_guardian_id: child1.guardianId, p_student_id: child2.studentId, p_relationship: "mãe" });
  });

  it("filho devedor não bloqueia o irmão (restrição por contexto)", async () => {
    await rpc(org.coach, "set_access_policy", { p_student_id: null, p_mode: "restrict_modules", p_grace_days: 0 });
    // Fatura do child1 vencida ontem.
    await sql("update public.invoices set due_date = private.org_today($2) - 1 where student_id = $1", [child1.studentId, org.orgId]);
    await sql("update public.invoices set due_date = private.org_today($2) + 5 where student_id = $1", [child2.studentId, org.orgId]);
    const guardian = child1.session!;
    const e = await rpcError(guardian, "student_lessons", { p_student_id: child1.studentId, p_from: today, p_to: addDays(today, 7) });
    expect(e.code).toBe("CS423");
    const ok = await rpc(guardian, "student_lessons", { p_student_id: child2.studentId, p_from: today, p_to: addDays(today, 7) });
    expect(Array.isArray(ok)).toBe(true);
    // Área de regularização continua acessível para o devedor.
    const { data: invoices } = await guardian.client.from("invoices").select("id, status").eq("student_id", child1.studentId);
    expect(invoices!.length).toBeGreaterThan(0);
    const instr = await rpc<{ configured: boolean }>(guardian, "payment_instructions", { p_invoice_id: invoices![0].id });
    expect(instr).toHaveProperty("configured");
    await rpc(org.coach, "set_access_policy", { p_student_id: null, p_mode: "warn_only", p_grace_days: 0 });
  });

  it("professor de outra organização não vê nada desta organização", async () => {
    for (const table of PROTECTED_TABLES) {
      const { data } = await otherOrg.coach.client.from(table).select("organization_id");
      for (const row of data ?? []) {
        expect((row as { organization_id?: string }).organization_id, table).not.toBe(org.orgId);
      }
    }
    const err = await rpcError(otherOrg.coach, "set_student_private_note", { p_student_id: a.studentId, p_note: "x" });
    expect(err.code).toBe("CS404");
    const e2 = await rpcError(otherOrg.coach, "create_enrollment", {
      p_student_id: a.studentId, p_series_id: seriesId, p_valid_from: today, p_valid_until: null });
    expect(e2.code).toBe("CS404");
  });

  it("professor sem MFA (aal1) não acessa dados", async () => {
    const { data: s } = await admin.auth.admin.getUserById(org.coach.userId);
    const { signIn } = await import("../helpers/db");
    const aal1 = await signIn(s.user!.email!);
    const { data } = await aal1.client.from("students").select("id");
    expect(data).toEqual([]);
    const err = await rpcError(aal1, "create_student", { p_payload: { full_name: "X", kind: "adult", email: "x@example.test" } });
    expect(err.code).toBe("CS403");
    const ctx = await rpc<{ is_coach: boolean; aal: string }>(aal1, "my_context");
    expect(ctx).toMatchObject({ is_coach: true, aal: "aal1" });
  });

  it("dia da semana seguinte para matrícula existe (sanidade)", () => {
    expect(nextWeekday("2026-09-27", 1)).toBe("2026-09-28");
  });
});
