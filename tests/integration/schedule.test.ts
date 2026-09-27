import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays, createLinkedAdult, createLocation, createSeries, nextWeekday, orgToday, processOutbox, rpc, rpcError,
  setupOrg, sql, type Org,
} from "../helpers/db";

function isoDow(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

describe("Agenda: concorrência, conflitos e séries (critérios 6, 7 e 8)", () => {
  let org: Org;
  let today: string;
  let L1: { locationId: string; courtId: string };
  let L2: { locationId: string; courtId: string };

  beforeAll(async () => {
    org = await setupOrg();
    today = await orgToday(org.orgId);
    L1 = await createLocation(org, "Clube Norte");
    L2 = await createLocation(org, "Clube Sul");
  });

  it("duas aprovações concorrentes pela última vaga geram apenas uma matrícula (critério 6)", async () => {
    const series = await createSeries(org, {
      weekday: 1, start_time: "07:00", duration_minutes: 60, valid_from: today, format: "individual",
      location_id: L1.locationId, court_id: L1.courtId,
    });
    const a = await createLinkedAdult(org);
    const b = await createLinkedAdult(org);
    const reqA = await rpc<string>(a.session, "request_enrollment", { p_student_id: a.studentId, p_series_id: series });
    const reqB = await rpc<string>(b.session, "request_enrollment", { p_student_id: b.studentId, p_series_id: series });
    // Pedido pendente não ocupa vaga: ambos foram aceitos como pedidos.
    const results = await Promise.allSettled([
      rpc(org.coach, "decide_enrollment_request", { p_request_id: reqA, p_approve: true }),
      rpc(org.coach, "decide_enrollment_request", { p_request_id: reqB, p_approve: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("CS409");
    const count = await sql<{ n: string }>(
      "select count(*) as n from public.enrollments where series_id = $1 and status = 'active'", [series]);
    expect(Number(count[0].n)).toBe(1);

    // Pedido duplicado ativo é impedido.
    const c = await createLinkedAdult(org);
    const series2 = await createSeries(org, {
      weekday: 2, start_time: "07:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 3,
      location_id: L1.locationId,
    });
    await rpc(c.session, "request_enrollment", { p_student_id: c.studentId, p_series_id: series2 });
    const dup = await rpcError(c.session, "request_enrollment", { p_student_id: c.studentId, p_series_id: series2 });
    expect(dup.code).toBe("CS409");
  });

  it("matrículas diretas concorrentes respeitam a capacidade", async () => {
    const series = await createSeries(org, {
      weekday: 3, start_time: "06:00", duration_minutes: 60, valid_from: today, format: "double",
      location_id: L2.locationId, court_id: L2.courtId,
    });
    const students = await Promise.all([1, 2, 3, 4].map(() =>
      rpc<{ student_id: string }>(org.coach, "create_student", {
        p_payload: { full_name: "Concorrente", kind: "adult", phone: "11999990000" } })));
    const results = await Promise.allSettled(students.map((s) =>
      rpc(org.coach, "create_enrollment", { p_student_id: s.student_id, p_series_id: series, p_valid_from: today })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });

  it("impede conflitos de professor, quadra e deslocamento, inclusive em recorrências futuras (critério 7)", async () => {
    const base = { duration_minutes: 60, valid_from: today, format: "group", capacity: 4 };
    await createSeries(org, { ...base, weekday: 4, start_time: "18:00", location_id: L1.locationId, court_id: L1.courtId, travel_buffer_minutes: 30 });

    // Sobreposição (professor) e mesma quadra.
    const overlapCourt = await rpcError(org.coach, "create_series", { p_payload: {
      ...base, weekday: 4, start_time: "18:30", location_id: L1.locationId, court_id: L1.courtId } });
    expect(overlapCourt.code).toBe("CS409");
    expect(overlapCourt.message).toContain("Conflito de agenda");

    // Adjacente no mesmo local é permitido.
    await createSeries(org, { ...base, weekday: 4, start_time: "19:00", location_id: L1.locationId, court_id: L1.courtId, travel_buffer_minutes: 30 });

    // Outro local exige deslocamento: 20:15 (15 min após 20:00) conflita; 20:30 não.
    const travel = await rpcError(org.coach, "create_series", { p_payload: {
      ...base, weekday: 4, start_time: "20:15", location_id: L2.locationId, travel_buffer_minutes: 30 } });
    expect(travel.code).toBe("CS409");
    await createSeries(org, { ...base, weekday: 4, start_time: "20:30", location_id: L2.locationId, travel_buffer_minutes: 30 });

    // Recorrência futura: série que só começa daqui a 30 dias.
    const futureStart = addDays(today, 30);
    await createSeries(org, { ...base, weekday: 5, start_time: "18:00", valid_from: futureStart, location_id: L1.locationId });
    // Série que termina antes não conflita…
    await createSeries(org, { ...base, weekday: 5, start_time: "18:00", valid_until: addDays(today, 20), location_id: L2.locationId });
    // …mas uma série aberta a partir de hoje conflita com a futura.
    const future = await rpcError(org.coach, "create_series", { p_payload: {
      ...base, weekday: 5, start_time: "18:30", location_id: L1.locationId } });
    expect(future.code).toBe("CS409");
  });

  it("impede conflito de agenda do aluno, inclusive com deslocamento", async () => {
    const s1 = await createSeries(org, {
      weekday: 6, start_time: "08:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 4,
      location_id: L1.locationId, travel_buffer_minutes: 30,
    });
    const student = await rpc<{ student_id: string }>(org.coach, "create_student", {
      p_payload: { full_name: "Aluno Agenda", kind: "adult", phone: "11999990001", enrollments: [{ series_id: s1 }] } });
    // Simula série de outro professor (futuro multi-professor) inserida diretamente, 20 min após, em outro local.
    const other = (await sql<{ id: string }>(
      `insert into public.recurring_slots (organization_id, weekday, start_time, duration_minutes, valid_from, format, capacity,
         location_id, travel_buffer_minutes) values ($1, 6, '09:20', 60, $2, 'group', 4, $3, 30) returning id`,
      [org.orgId, today, L2.locationId]))[0].id;
    const err = await rpcError(org.coach, "create_enrollment", {
      p_student_id: student.student_id, p_series_id: other, p_valid_from: today });
    expect(err.code).toBe("CS409");
    expect(err.message).toContain("Aluno já tem aula");
  });

  it("remarcação de ocorrência valida conflitos concretos", async () => {
    const dow = 7;
    const s1 = await createSeries(org, {
      weekday: dow, start_time: "10:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 4, location_id: L1.locationId });
    await createSeries(org, {
      weekday: dow, start_time: "12:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 4, location_id: L1.locationId });
    const date = nextWeekday(addDays(today, 1), dow);
    const occ = (await sql<{ id: string }>(
      "select id from public.lesson_occurrences where series_id = $1 and local_date = $2", [s1, date]))[0];
    const err = await rpcError(org.coach, "update_occurrence", { p_occurrence_id: occ.id, p_payload: { start_time: "11:30" } });
    expect(err.code).toBe("CS409");
    await rpc(org.coach, "update_occurrence", { p_occurrence_id: occ.id, p_payload: { start_time: "14:00", note: "Remarcada" } });
    const moved = (await sql<{ start_time: string; is_exception: boolean }>(
      "select start_time::text, is_exception from public.lesson_occurrences where id = $1", [occ.id]))[0];
    expect(moved).toEqual({ start_time: "14:00:00", is_exception: true });
  });

  it("edição de série preserva histórico, exceções e vigência (critério 8)", async () => {
    const dow = isoDow(today);
    // Série criada hoje e "envelhecida" 3 semanas para simular histórico.
    const series = await createSeries(org, {
      weekday: dow, start_time: "21:00", duration_minutes: 60, valid_from: today, format: "group", capacity: 4, location_id: L2.locationId });
    const past = addDays(today, -21);
    await sql("update public.recurring_slots set valid_from = $2 where id = $1", [series, past]);
    await sql("select private.generate_occurrences($1, $2, $3)", [org.orgId, past, addDays(today, 90)]);
    const student = await createLinkedAdult(org);
    await rpc(org.coach, "create_enrollment", { p_student_id: student.studentId, p_series_id: series, p_valid_from: past });

    const pastOcc = (await sql<{ id: string }>(
      "select id from public.lesson_occurrences where series_id = $1 and local_date = $2", [series, addDays(today, -7)]))[0];
    await rpc(org.coach, "save_attendance", { p_occurrence_id: pastOcc.id, p_marks: [{ student_id: student.studentId, status: "present" }] });
    const futureException = (await sql<{ id: string }>(
      "select id from public.lesson_occurrences where series_id = $1 and local_date = $2", [series, addDays(today, 14)]))[0];
    await rpc(org.coach, "cancel_occurrence", { p_occurrence_id: futureException.id, p_reason: "Torneio no clube" });

    const effective = addDays(today, 1);
    const preview = await rpc<{ affected_students: unknown[]; capacity_ok: boolean; exceptions_preserved: number; conflicts: string[] }>(
      org.coach, "preview_series_change", { p_series_id: series, p_effective_date: effective, p_payload: { start_time: "20:00" } });
    expect(preview.affected_students).toHaveLength(1);
    expect(preview.capacity_ok).toBe(true);
    expect(preview.exceptions_preserved).toBeGreaterThanOrEqual(1);
    expect(preview.conflicts).toEqual([]);

    const past2 = await rpcError(org.coach, "update_series_from", {
      p_series_id: series, p_effective_date: addDays(today, -1), p_payload: { start_time: "20:00" } });
    expect(past2.code).toBe("CS422");

    const newVersion = await rpc<string>(org.coach, "update_series_from", {
      p_series_id: series, p_effective_date: effective, p_payload: { start_time: "20:00" } });
    expect(newVersion).not.toBe(series);

    const versions = await sql<{ id: string; valid_from: string; valid_until: string | null; start_time: string }>(
      "select id, valid_from::text, valid_until::text, start_time::text from public.recurring_slots where series_root_id = $1 order by valid_from",
      [series]);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ id: series, valid_until: today, start_time: "21:00:00" });
    expect(versions[1]).toMatchObject({ id: newVersion, valid_from: effective, valid_until: null, start_time: "20:00:00" });

    // Passado intacto, com presença.
    const pastRow = (await sql<{ start_time: string; series_id: string; status: string }>(
      "select start_time::text, series_id, status from public.lesson_occurrences where id = $1", [pastOcc.id]))[0];
    expect(pastRow).toEqual({ start_time: "21:00:00", series_id: series, status: "completed" });
    const att = await sql("select status from public.attendance where occurrence_id = $1", [pastOcc.id]);
    expect(att).toEqual([{ status: "present" }]);

    // Exceção futura preservada (continua cancelada).
    const exc = (await sql<{ status: string; cancel_reason: string }>(
      "select status, cancel_reason from public.lesson_occurrences where id = $1", [futureException.id]))[0];
    expect(exc).toEqual({ status: "cancelled", cancel_reason: "Torneio no clube" });

    // Ocorrências futuras regeneradas no novo horário.
    const later = await sql<{ start_time: string; series_id: string }>(
      "select start_time::text, series_id from public.lesson_occurrences where series_root_id = $1 and local_date = $2",
      [series, addDays(today, 7)]);
    expect(later).toEqual([{ start_time: "20:00:00", series_id: newVersion }]);

    // Matrícula dividida por vigência, sem sobreposição.
    const enr = await sql<{ series_id: string; valid_from: string; valid_until: string | null }>(
      "select series_id, valid_from::text, valid_until::text from public.enrollments where student_id = $1 and status = 'active' order by valid_from",
      [student.studentId]);
    expect(enr).toEqual([
      { series_id: series, valid_from: past, valid_until: today },
      { series_id: newVersion, valid_from: effective, valid_until: null },
    ]);

    // Aluno foi notificado da mudança.
    await processOutbox();
    const { data: notes } = await student.session.client.from("notifications").select("title");
    expect(notes!.map((n) => n.title)).toContain("Horário fixo alterado");
  });

  it("cancelamento não vira falta nem gera crédito; indisponibilidade cancela aulas futuras", async () => {
    const dow = isoDow(addDays(today, 2));
    const series = await createSeries(org, {
      weekday: dow, start_time: "15:00", duration_minutes: 45, valid_from: today, format: "group", capacity: 4, location_id: L1.locationId });
    const student = await createLinkedAdult(org, { enrollments: [{ series_id: series }] });
    const date = addDays(today, 2);
    await rpc(org.coach, "create_unavailability", { p_starts_on: date, p_ends_on: date, p_location_id: null, p_reason: "Feriado municipal" });
    const occ = (await sql<{ status: string; cancel_reason: string }>(
      "select status, cancel_reason from public.lesson_occurrences where series_id = $1 and local_date = $2", [series, date]))[0];
    expect(occ).toEqual({ status: "cancelled", cancel_reason: "Feriado municipal" });
    const summary = await rpc<{ absent: number; not_recorded: number }>(student.session, "attendance_summary", {
      p_student_id: student.studentId, p_from: addDays(today, -30), p_to: addDays(today, 30) });
    expect(summary.absent).toBe(0);
    expect(summary.not_recorded).toBe(0);
    const lessons = await rpc<{ status: string; cancel_reason: string }[]>(student.session, "student_lessons", {
      p_student_id: student.studentId, p_from: date, p_to: date });
    expect(lessons[0]).toMatchObject({ status: "cancelled", cancel_reason: "Feriado municipal" });
  });

  it("geração de ocorrências é idempotente", async () => {
    const before = await sql<{ n: string }>("select count(*) n from public.lesson_occurrences where organization_id = $1", [org.orgId]);
    await sql("select private.generate_occurrences($1, $2, $3)", [org.orgId, today, addDays(today, 90)]);
    await sql("select private.generate_occurrences($1, $2, $3)", [org.orgId, today, addDays(today, 90)]);
    const after = await sql<{ n: string }>("select count(*) n from public.lesson_occurrences where organization_id = $1", [org.orgId]);
    expect(after[0].n).toBe(before[0].n);
  });
});
