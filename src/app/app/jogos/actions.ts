"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { isValidDate } from "@/lib/dates";

function parseSets(fd: FormData) {
  const sets: Record<string, number | boolean | null>[] = [];
  for (let i = 1; i <= 5; i++) {
    const p = str(fd, `set${i}_p`);
    const o = str(fd, `set${i}_o`);
    if (p === "" && o === "") continue;
    const tbp = str(fd, `set${i}_tbp`);
    const tbo = str(fd, `set${i}_tbo`);
    const mtb = fd.get(`set${i}_mtb`) === "on";
    sets.push({
      player_games: mtb ? 1 : Number(p || 0), opponent_games: mtb ? 0 : Number(o || 0),
      tiebreak_player: mtb ? Number(p) : tbp === "" ? null : Number(tbp),
      tiebreak_opponent: mtb ? Number(o) : tbo === "" ? null : Number(tbo),
      is_match_tiebreak: mtb,
    });
  }
  return sets;
}

export async function saveMatchAction(studentId: string, matchId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const played = str(fd, "played_on");
  if (!isValidDate(played)) return { ok: false, fieldErrors: { played_on: "Data inválida." }, values };
  if (!str(fd, "opponent_name")) return { ok: false, fieldErrors: { opponent_name: "Informe o adversário." }, values };
  const kind = str(fd, "result_kind") || "completed";
  const payload = {
    played_on: played, event_name: opt(fd, "event_name"), opponent_name: str(fd, "opponent_name"),
    match_type: str(fd, "match_type") || "singles", partner_name: opt(fd, "partner_name"), opponent2_name: opt(fd, "opponent2_name"),
    format: str(fd, "format"), result_kind: kind, manual_outcome: opt(fd, "manual_outcome"), comments: opt(fd, "comments"),
    sets: kind.startsWith("walkover") ? [] : parseSets(fd),
  };
  return runRpc<string>("participant", "save_match", { p_match_id: matchId, p_student_id: studentId, p_payload: payload },
    { values, success: "Jogo salvo.", redirectTo: (id) => `/app/jogos/${id}` });
}

export async function deleteMatchAction(matchId: string, _: ActionState): Promise<ActionState> {
  return runRpc("participant", "delete_match", { p_match_id: matchId }, { success: "Jogo apagado.", redirectTo: "/app/jogos" });
}
