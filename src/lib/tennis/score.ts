/**
 * Espelho da regra autoritativa private.evaluate_match_score (SQL), usado
 * para feedback imediato no formulário. O servidor sempre revalida.
 */
export type MatchFormat =
  | "best_of_3" | "best_of_3_match_tiebreak" | "best_of_5" | "single_set" | "pro_set_8" | "short_sets_best_of_3" | "custom";

export type SetScore = {
  player_games: number;
  opponent_games: number;
  tiebreak_player?: number | null;
  tiebreak_opponent?: number | null;
  is_match_tiebreak?: boolean;
};

export const MATCH_FORMATS: { value: MatchFormat; label: string; help: string }[] = [
  { value: "best_of_3", label: "Melhor de 3 sets", help: "Sets até 6 games, tie-break em 6-6." },
  { value: "best_of_3_match_tiebreak", label: "2 sets + match tie-break", help: "3º set é um match tie-break de 10 pontos." },
  { value: "best_of_5", label: "Melhor de 5 sets", help: "Sets até 6 games, tie-break em 6-6." },
  { value: "single_set", label: "Set único", help: "Um set até 6 games, tie-break em 6-6." },
  { value: "pro_set_8", label: "Pro set (8 games)", help: "Set único até 8 games, tie-break em 8-8." },
  { value: "short_sets_best_of_3", label: "Sets curtos (até 4)", help: "Melhor de 3 sets até 4 games, tie-break em 4-4." },
  { value: "custom", label: "Formato livre (treino)", help: "Placar livre; você informa o resultado." },
];

export class ScoreError extends Error {}

function validTiebreak(a: number, b: number, target: number) {
  return Math.max(a, b) >= target && Math.abs(a - b) >= 2 && (Math.max(a, b) === target || Math.abs(a - b) === 2);
}

export function evaluateScore(format: MatchFormat, sets: SetScore[], allowPartialLast: boolean): "player" | "opponent" | "none" {
  if (format === "custom") return "none";
  const target = format === "pro_set_8" ? 8 : format === "short_sets_best_of_3" ? 4 : 6;
  const toWin = format === "best_of_5" ? 3 : format === "single_set" || format === "pro_set_8" ? 1 : 2;
  if (sets.length > toWin * 2 - 1) throw new ScoreError("Número de sets maior que o permitido para o formato.");
  let p = 0;
  let o = 0;
  sets.forEach((s, idx) => {
    const i = idx + 1;
    if (p === toWin || o === toWin) throw new ScoreError("Há sets registrados depois de o jogo já estar decidido.");
    const a = s.player_games;
    const b = s.opponent_games;
    const ta = s.tiebreak_player ?? null;
    const tb = s.tiebreak_opponent ?? null;
    let winner: "p" | "o" | null = null;
    if (s.is_match_tiebreak) {
      if (format !== "best_of_3_match_tiebreak" || i !== 3) throw new ScoreError("Match tie-break só é permitido como 3º set no formato com match tie-break.");
      if (ta === null || tb === null) throw new ScoreError("Informe os pontos do match tie-break.");
      if (validTiebreak(ta, tb, 10)) winner = ta > tb ? "p" : "o";
      else if (!(allowPartialLast && i === sets.length)) throw new ScoreError("Match tie-break inválido: vence quem chega a 10 pontos com 2 de diferença.");
    } else {
      if (format === "best_of_3_match_tiebreak" && i === 3) throw new ScoreError("No formato com match tie-break, o 3º set deve ser um match tie-break.");
      const clean = (a === target && b <= target - 2) || (b === target && a <= target - 2) ||
        (a === target + 1 && b === target - 1) || (b === target + 1 && a === target - 1);
      const tiebreakSet = (a === target + 1 && b === target) || (b === target + 1 && a === target);
      if (clean) {
        if (ta !== null) throw new ScoreError("Tie-break informado em set que não chegou ao empate.");
        winner = a > b ? "p" : "o";
      } else if (tiebreakSet) {
        if (ta === null || tb === null || !validTiebreak(ta, tb, 7) || (ta > tb) !== (a > b)) {
          throw new ScoreError(`Set ${i}: informe um tie-break válido (7 pontos com 2 de diferença, vencido por quem ganhou o set).`);
        }
        winner = a > b ? "p" : "o";
      } else if (allowPartialLast && i === sets.length && a <= target && b <= target) {
        winner = null;
      } else {
        throw new ScoreError(`Set ${i} com placar ${a}-${b} é inválido para o formato.`);
      }
    }
    if (winner === "p") p++;
    if (winner === "o") o++;
  });
  return p === toWin ? "player" : o === toWin ? "opponent" : "none";
}
