import { MATCH_OUTCOME } from "@/lib/labels";
import { MATCH_FORMATS } from "@/lib/tennis/score";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/card";

export type MatchRow = {
  id: string; played_on: string; opponent_name: string; match_type: string; partner_name: string | null; opponent2_name: string | null;
  format: string; outcome: string; outcome_source: string; event_name: string | null; comments: string | null; author_kind: string;
  created_at: string; updated_at: string;
  match_sets: { set_number: number; player_games: number; opponent_games: number; tiebreak_player: number | null; tiebreak_opponent: number | null; is_match_tiebreak: boolean }[];
};

export function scoreText(sets: MatchRow["match_sets"]) {
  if (!sets.length) return "Sem placar";
  return [...sets].sort((a, b) => a.set_number - b.set_number).map((s) =>
    s.is_match_tiebreak ? `[${s.tiebreak_player}-${s.tiebreak_opponent}]`
      : `${s.player_games}-${s.opponent_games}${s.tiebreak_player !== null ? `(${Math.min(s.tiebreak_player, s.tiebreak_opponent!)})` : ""}`).join(" ");
}

export function MatchSummary({ m }: { m: MatchRow }) {
  const o = MATCH_OUTCOME[m.outcome];
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">vs {m.opponent_name}{m.match_type === "doubles" && m.opponent2_name ? ` / ${m.opponent2_name}` : ""}</span>
        <StatusBadge tone={o.tone}>{o.label}</StatusBadge>
        {m.outcome_source === "manual" ? <StatusBadge tone="neutral">Resultado informado</StatusBadge> : null}
      </div>
      <p className="text-sm text-muted">
        {formatDate(m.played_on)} · {MATCH_FORMATS.find((f) => f.value === m.format)?.label} · <span className="font-mono">{scoreText(m.match_sets)}</span>
        {m.match_type === "doubles" && m.partner_name ? ` · parceiro(a): ${m.partner_name}` : ""}
        {m.event_name ? ` · ${m.event_name}` : ""}
      </p>
    </div>
  );
}

export type MatchStats = {
  total: number; completed: number; wins: number; losses: number; win_rate: number | null;
  walkover_wins: number; walkover_losses: number; retired_wins: number; retired_losses: number; incomplete: number;
};

export function MatchStatsGrid({ s }: { s: MatchStats }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vitórias" value={s.wins} tone="success" />
        <Stat label="Derrotas" value={s.losses} tone="danger" />
        <Stat label="Aproveitamento" value={s.win_rate === null ? "—" : `${s.win_rate.toLocaleString("pt-BR")}%`} hint={`${s.completed} partidas concluídas`} />
        <Stat label="Outros" value={s.walkover_wins + s.walkover_losses + s.retired_wins + s.retired_losses + s.incomplete}
          hint={`W.O. ${s.walkover_wins}/${s.walkover_losses} · desist. ${s.retired_wins}/${s.retired_losses} · incompl. ${s.incomplete}`} />
      </div>
      <p className="text-xs text-muted">
        Aproveitamento considera apenas partidas concluídas (placar completo ou resultado informado em formato livre). W.O.,
        desistências e jogos incompletos aparecem separados e não entram no percentual.
      </p>
    </div>
  );
}
