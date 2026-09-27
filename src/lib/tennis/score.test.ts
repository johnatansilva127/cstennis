import { describe, expect, it } from "vitest";
import { evaluateScore, ScoreError } from "./score";

describe("placar de tênis (mesmas regras do SQL)", () => {
  it("formatos suportados, tie-break e match tie-break", () => {
    expect(evaluateScore("best_of_3", [{ player_games: 6, opponent_games: 4 }, { player_games: 7, opponent_games: 6, tiebreak_player: 7, tiebreak_opponent: 5 }], false)).toBe("player");
    expect(evaluateScore("best_of_3", [{ player_games: 6, opponent_games: 4 }, { player_games: 3, opponent_games: 6 }, { player_games: 5, opponent_games: 7 }], false)).toBe("opponent");
    expect(evaluateScore("best_of_3_match_tiebreak", [{ player_games: 4, opponent_games: 6 }, { player_games: 6, opponent_games: 3 }, { player_games: 1, opponent_games: 0, tiebreak_player: 12, tiebreak_opponent: 10, is_match_tiebreak: true }], false)).toBe("player");
    expect(evaluateScore("pro_set_8", [{ player_games: 9, opponent_games: 8, tiebreak_player: 7, tiebreak_opponent: 3 }], false)).toBe("player");
    expect(evaluateScore("short_sets_best_of_3", [{ player_games: 4, opponent_games: 2 }, { player_games: 5, opponent_games: 3 }], false)).toBe("player");
    expect(evaluateScore("best_of_5", [{ player_games: 6, opponent_games: 0 }, { player_games: 6, opponent_games: 0 }], false)).toBe("none");
    expect(evaluateScore("custom", [], false)).toBe("none");
  });

  it("incompleto não produz vitória e placares inconsistentes são recusados", () => {
    expect(evaluateScore("best_of_3", [{ player_games: 6, opponent_games: 2 }, { player_games: 2, opponent_games: 1 }], true)).toBe("none");
    expect(() => evaluateScore("best_of_3", [{ player_games: 6, opponent_games: 5 }], false)).toThrow(ScoreError);
    expect(() => evaluateScore("best_of_3", [{ player_games: 7, opponent_games: 6 }], false)).toThrow(/tie-break/);
    expect(() => evaluateScore("best_of_3", [{ player_games: 7, opponent_games: 6, tiebreak_player: 8, tiebreak_opponent: 7 }], false)).toThrow();
    expect(() => evaluateScore("best_of_3", [{ player_games: 6, opponent_games: 0 }, { player_games: 6, opponent_games: 0 }, { player_games: 6, opponent_games: 0 }], false)).toThrow(/decidido/);
    expect(() => evaluateScore("best_of_3_match_tiebreak", [{ player_games: 6, opponent_games: 1 }, { player_games: 1, opponent_games: 6 }, { player_games: 6, opponent_games: 4 }], false)).toThrow(/match tie-break/);
  });
});
