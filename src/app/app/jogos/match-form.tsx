"use client";

import { useState } from "react";
import { ActionForm, SelectField, TextAreaField, TextField, useFormCtx } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/status";
import { MATCH_FORMATS, evaluateScore, ScoreError, type MatchFormat, type SetScore } from "@/lib/tennis/score";
import type { ActionState } from "@/lib/errors";

type Initial = {
  played_on: string; event_name: string | null; opponent_name: string; match_type: string; partner_name: string | null; opponent2_name: string | null;
  format: string; result_kind: string; manual_outcome: string | null; comments: string | null;
  sets: { player_games: number; opponent_games: number; tiebreak_player: number | null; tiebreak_opponent: number | null; is_match_tiebreak: boolean }[];
};

const RESULT_KINDS = [
  { value: "completed", label: "Jogo concluído (resultado pelo placar)" },
  { value: "incomplete", label: "Incompleto (não terminou)" },
  { value: "retired_win", label: "Adversário desistiu" },
  { value: "retired_loss", label: "Desisti / abandonei" },
  { value: "walkover_win", label: "Vitória por W.O." },
  { value: "walkover_loss", label: "Derrota por W.O." },
];

function SetsEditor({ format, kind, initial }: { format: MatchFormat; kind: string; initial?: Initial["sets"] }) {
  const { state } = useFormCtx();
  const max = format === "best_of_5" ? 5 : format === "single_set" || format === "pro_set_8" ? 1 : format === "custom" ? 5 : 3;
  const [preview, setPreview] = useState<string | null>(null);
  const v = (k: string, fallback?: number | null) => state.values?.[k] ?? (fallback === null || fallback === undefined ? "" : String(fallback));

  function check(form: HTMLFormElement) {
    if (format === "custom" || kind.startsWith("walkover")) return setPreview(null);
    const fd = new FormData(form);
    const sets: SetScore[] = [];
    for (let i = 1; i <= max; i++) {
      const p = fd.get(`set${i}_p`) as string; const o = fd.get(`set${i}_o`) as string;
      if (!p && !o) continue;
      const mtb = fd.get(`set${i}_mtb`) === "on";
      const tbp = fd.get(`set${i}_tbp`) as string; const tbo = fd.get(`set${i}_tbo`) as string;
      sets.push({ player_games: mtb ? 1 : Number(p || 0), opponent_games: mtb ? 0 : Number(o || 0),
        tiebreak_player: mtb ? Number(p) : tbp ? Number(tbp) : null, tiebreak_opponent: mtb ? Number(o) : tbo ? Number(tbo) : null, is_match_tiebreak: mtb });
    }
    try {
      const w = evaluateScore(format, sets, kind !== "completed");
      setPreview(w === "player" ? "Pelo placar: vitória." : w === "opponent" ? "Pelo placar: derrota." : "Placar ainda incompleto para o formato.");
    } catch (e) {
      setPreview(e instanceof ScoreError ? e.message : null);
    }
  }

  if (kind.startsWith("walkover")) return <p className="text-sm text-muted">W.O. não tem placar.</p>;
  return (
    <div className="space-y-3" onBlur={(e) => { const f = (e.target as HTMLElement).closest("form"); if (f) check(f); }}>
      {Array.from({ length: max }, (_, idx) => {
        const i = idx + 1;
        const init = initial?.[idx];
        const allowMtb = format === "best_of_3_match_tiebreak" && i === 3;
        return (
          <fieldset key={i} className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{allowMtb ? "3º set / match tie-break" : `${i}º set`}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TextField name={`set${i}_p`} label={allowMtb ? "Seus games/pontos" : "Seus games"} type="number" min={0} max={99} inputMode="numeric"
                defaultValue={v(`set${i}_p`, init ? (init.is_match_tiebreak ? init.tiebreak_player : init.player_games) : null)} />
              <TextField name={`set${i}_o`} label={allowMtb ? "Adversário games/pontos" : "Games do adversário"} type="number" min={0} max={99} inputMode="numeric"
                defaultValue={v(`set${i}_o`, init ? (init.is_match_tiebreak ? init.tiebreak_opponent : init.opponent_games) : null)} />
              <TextField name={`set${i}_tbp`} label="Seu tie-break" type="number" min={0} max={99} inputMode="numeric"
                defaultValue={v(`set${i}_tbp`, init && !init.is_match_tiebreak ? init.tiebreak_player : null)} hint="Só em set empatado" />
              <TextField name={`set${i}_tbo`} label="Tie-break adversário" type="number" min={0} max={99} inputMode="numeric"
                defaultValue={v(`set${i}_tbo`, init && !init.is_match_tiebreak ? init.tiebreak_opponent : null)} />
            </div>
            {allowMtb ? (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name={`set${i}_mtb`} defaultChecked={init?.is_match_tiebreak ?? true} className="size-5" />
                Este set foi um match tie-break (informe os pontos, ex.: 10 a 8)
              </label>
            ) : null}
          </fieldset>
        );
      })}
      <div aria-live="polite">{preview ? <Alert tone="info">{preview}</Alert> : null}</div>
    </div>
  );
}

export function MatchForm({ action, initial, today }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; initial?: Initial; today: string;
}) {
  const [format, setFormat] = useState<MatchFormat>((initial?.format as MatchFormat) ?? "best_of_3");
  const [type, setType] = useState(initial?.match_type ?? "singles");
  const [kind, setKind] = useState(initial?.result_kind ?? "completed");
  return (
    <ActionForm action={action} submitLabel="Salvar jogo" pendingLabel="Salvando…">
      <Card>
        <CardHeader title="Jogo" />
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="played_on" type="date" label="Data" defaultValue={initial?.played_on ?? today} max={today} required />
            <TextField name="event_name" label="Torneio / evento (opcional)" defaultValue={initial?.event_name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="match_type" className="label-caps block text-muted">Tipo</label>
              <select id="match_type" name="match_type" value={type} onChange={(e) => setType(e.target.value)} className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5">
                <option value="singles">Simples</option><option value="doubles">Duplas</option>
              </select>
            </div>
            <TextField name="opponent_name" label="Adversário (nome ou apelido)" defaultValue={initial?.opponent_name} required maxLength={80} />
          </div>
          {type === "doubles" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="partner_name" label="Seu parceiro(a)" defaultValue={initial?.partner_name} maxLength={80} />
              <TextField name="opponent2_name" label="2º adversário" defaultValue={initial?.opponent2_name} maxLength={80} />
            </div>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="Formato e resultado" />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="format" className="label-caps block text-muted">Formato</label>
            <select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value as MatchFormat)} className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5">
              {MATCH_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <p className="text-xs text-muted">{MATCH_FORMATS.find((f) => f.value === format)?.help}</p>
          </div>
          {format === "custom" ? (
            <SelectField name="manual_outcome" label="Resultado (informado por você)" defaultValue={initial?.manual_outcome ?? ""} required placeholder="Selecione"
              options={[{ value: "win", label: "Vitória" }, { value: "loss", label: "Derrota" }, { value: "incomplete", label: "Incompleto" }]} />
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="result_kind" className="label-caps block text-muted">Como terminou</label>
              <select id="result_kind" name="result_kind" value={kind} onChange={(e) => setKind(e.target.value)} className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5">
                {RESULT_KINDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          )}
          <SetsEditor format={format} kind={format === "custom" ? "custom" : kind} initial={initial?.sets} />
        </div>
      </Card>
      <Card>
        <TextAreaField name="comments" label="Comentários (como foi o jogo?)" defaultValue={initial?.comments} rows={4} maxLength={2000} />
      </Card>
    </ActionForm>
  );
}
