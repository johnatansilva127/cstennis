import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays, createLinkedAdult, createLocation, createSeries, orgToday, rpc, setupOrg, sql, type Org, type Session,
} from "../helpers/db";

function isoDow(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

describe("Indicadores batem com fixtures conhecidas (critério 16)", () => {
  let org: Org;
  let today: string;
  let s: { studentId: string; session: Session };

  beforeAll(async () => {
    org = await setupOrg();
    today = await orgToday(org.orgId);
    s = await createLinkedAdult(org);
  });

  it("frequência: presentes ÷ marcações em aulas concluídas; não informadas e canceladas à parte", async () => {
    const { locationId } = await createLocation(org);
    const dow = isoDow(today);
    const series = await createSeries(org, {
      weekday: dow, start_time: "05:00", duration_minutes: 30, valid_from: today, format: "group", capacity: 4, location_id: locationId });
    const start = addDays(today, -42);
    await sql("update public.recurring_slots set valid_from = $2 where id = $1", [series, start]);
    await sql("select private.generate_occurrences($1, $2, $3)", [org.orgId, start, addDays(today, 30)]);
    await rpc(org.coach, "create_enrollment", { p_student_id: s.studentId, p_series_id: series, p_valid_from: start });
    const occ = await sql<{ id: string; local_date: string }>(
      "select id, local_date::text from public.lesson_occurrences where series_id = $1 and local_date < $2 order by local_date", [series, today]);
    expect(occ).toHaveLength(6);
    const marks = ["present", "present", "absent", "excused"];
    for (let i = 0; i < 4; i++) {
      await rpc(org.coach, "save_attendance", { p_occurrence_id: occ[i].id, p_marks: [{ student_id: s.studentId, status: marks[i] }] });
    }
    await rpc(org.coach, "save_attendance", { p_occurrence_id: occ[4].id, p_marks: [] }); // concluída sem marcação
    await sql("update public.lesson_occurrences set status = 'cancelled', cancel_reason = 'Chuva' where id = $1", [occ[5].id]);

    const summary = await rpc(s.session, "attendance_summary", { p_student_id: s.studentId, p_from: start, p_to: addDays(today, 30) });
    expect(summary).toEqual({ present: 2, absent: 1, excused: 1, not_recorded: 1, marked: 4, rate: 50 });
  });

  it("jogos: percentual só com partidas concluídas; W.O., desistência e incompleto à parte", async () => {
    const play = (payload: Record<string, unknown>) =>
      rpc(s.session, "save_match", { p_match_id: null, p_student_id: s.studentId, p_payload: { played_on: today, opponent_name: "Rival", ...payload } });
    await play({ format: "best_of_3", sets: [{ player_games: 6, opponent_games: 4 }, { player_games: 7, opponent_games: 6, tiebreak_player: 7, tiebreak_opponent: 5 }] });
    await play({ format: "best_of_3_match_tiebreak", sets: [{ player_games: 4, opponent_games: 6 }, { player_games: 6, opponent_games: 3 }, { player_games: 1, opponent_games: 0, tiebreak_player: 10, tiebreak_opponent: 8, is_match_tiebreak: true }] });
    await play({ format: "pro_set_8", sets: [{ player_games: 8, opponent_games: 5 }] });
    await play({ format: "single_set", sets: [{ player_games: 3, opponent_games: 6 }] });
    await play({ format: "best_of_3", result_kind: "walkover_win", sets: [] });
    await play({ format: "best_of_3", result_kind: "retired_loss", sets: [{ player_games: 2, opponent_games: 3 }] });
    await play({ format: "best_of_3", result_kind: "incomplete", sets: [{ player_games: 6, opponent_games: 2 }, { player_games: 1, opponent_games: 1 }] });
    await play({ format: "custom", manual_outcome: "win", comments: "Treino com placar livre" });

    const stats = await rpc(s.session, "match_stats", { p_student_id: s.studentId, p_from: addDays(today, -1), p_to: today });
    expect(stats).toEqual({
      total: 8, completed: 5, wins: 4, losses: 1, win_rate: 80,
      walkover_wins: 1, walkover_losses: 0, retired_wins: 0, retired_losses: 1, incomplete: 1,
    });
  });

  it("placar inconsistente é recusado e incompleto não vira vitória", async () => {
    const bad = [
      { format: "best_of_3", sets: [{ player_games: 6, opponent_games: 5 }] },
      { format: "best_of_3", sets: [{ player_games: 7, opponent_games: 6 }] },
      { format: "best_of_3", sets: [{ player_games: 7, opponent_games: 6, tiebreak_player: 5, tiebreak_opponent: 7 }] },
      { format: "best_of_3", sets: [{ player_games: 6, opponent_games: 1 }, { player_games: 6, opponent_games: 1 }, { player_games: 6, opponent_games: 1 }] },
      { format: "best_of_3_match_tiebreak", sets: [{ player_games: 6, opponent_games: 1 }, { player_games: 1, opponent_games: 6 }, { player_games: 6, opponent_games: 4 }] },
      { format: "best_of_3", sets: [{ player_games: 6, opponent_games: 1 }] }, // incompleto marcado como concluído
    ];
    for (const payload of bad) {
      const { error } = await s.session.client.rpc("save_match", {
        p_match_id: null, p_student_id: s.studentId, p_payload: { played_on: today, opponent_name: "X", ...payload } });
      expect(error?.code, JSON.stringify(payload)).toBe("CS422");
    }
  });

  it("financeiro: previsto, recebido, a receber, vencido e em análise", async () => {
    const x = await createLinkedAdult(org);
    const month = today.slice(0, 8) + "01";
    const inv1 = await rpc<string>(org.coach, "create_manual_invoice", { p_student_id: x.studentId, p_competence: month, p_amount_cents: 10000, p_due_date: addDays(today, -2), p_reason: "Fixture 1" });
    const y = await createLinkedAdult(org);
    const inv2 = await rpc<string>(org.coach, "create_manual_invoice", { p_student_id: y.studentId, p_competence: month, p_amount_cents: 20000, p_due_date: addDays(today, 5), p_reason: "Fixture 2" });
    const z = await createLinkedAdult(org);
    const inv3 = await rpc<string>(org.coach, "create_manual_invoice", { p_student_id: z.studentId, p_competence: month, p_amount_cents: 30000, p_due_date: addDays(today, 3), p_reason: "Fixture 3" });
    const w = await createLinkedAdult(org);
    const inv4 = await rpc<string>(org.coach, "create_manual_invoice", { p_student_id: w.studentId, p_competence: month, p_amount_cents: 40000, p_due_date: addDays(today, 3), p_reason: "Fixture 4" });
    await rpc(org.coach, "record_manual_payment", { p_invoice_id: inv3, p_amount_cents: 30000, p_paid_on: today, p_method: "pix", p_justification: "Fixture paga" });
    await rpc(org.coach, "cancel_invoice", { p_invoice_id: inv4, p_reason: "Fixture cancelada" });
    const begin = await rpc<{ file_id: string }>(y.session, "begin_payment_submission", {
      p_invoice_id: inv2, p_detected_type: "pdf", p_mime_type: "application/pdf", p_size_bytes: 1000, p_sha256: "b".repeat(64) });
    const { admin } = await import("../helpers/db");
    await rpc(admin, "complete_payment_submission_upload", { p_file_id: begin.file_id, p_scan_status: "clean", p_scan_engine: "t" });

    const sum = await rpc<Record<string, number>>(org.coach, "finance_summary", { p_from_month: month, p_to_month: month });
    expect(sum).toMatchObject({
      expected_cents: 60000, expected_count: 3,
      received_cents: 30000, received_count: 1,
      receivable_cents: 20000, overdue_cents: 10000, overdue_count: 1,
      under_review_cents: 20000, under_review_count: 1,
      cancelled_cents: 40000, cancelled_count: 1, reversed_cents: 0,
    });
    void inv1;
  });
});
