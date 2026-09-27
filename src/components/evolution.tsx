import { SCORE_SCALE, SKILLS } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

export type AssessmentWithScores = {
  id: string; assessed_on: string; status: string; summary: string | null; published_at: string | null; updated_at: string;
  assessment_scores: { skill: string; score: number | null; comment: string | null }[];
};

/** Últimas notas por fundamento (barra de 1 a 5; "não avaliado" explícito). */
export function LatestScores({ assessment }: { assessment: AssessmentWithScores }) {
  const scores = new Map(assessment.assessment_scores.map((s) => [s.skill, s]));
  return (
    <ul className="space-y-3">
      {SKILLS.map((sk) => {
        const s = scores.get(sk.key);
        const value = s?.score ?? null;
        return (
          <li key={sk.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{sk.label}</span>
              <span className={value ? "font-bold" : "text-muted"}>
                {value ? SCORE_SCALE[value - 1].label : "Não avaliado"}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-5 gap-1" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-2 rounded-full ${value && n <= value ? "bg-primary" : "bg-surface-2"}`} />
              ))}
            </div>
            {s?.comment ? <p className="mt-1 text-xs text-muted">{s.comment}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Linha do tempo por fundamento: pontos apenas onde existe nota (sem
 * interpolar ou inventar valores). Acompanha tabela acessível.
 */
export function SkillTimeline({ assessments }: { assessments: AssessmentWithScores[] }) {
  const sorted = [...assessments].sort((a, b) => a.assessed_on.localeCompare(b.assessed_on));
  if (sorted.length < 2) return null;
  const w = 280;
  const h = 64;
  const x = (i: number) => 12 + (i * (w - 24)) / Math.max(sorted.length - 1, 1);
  const y = (v: number) => h - 8 - ((v - 1) * (h - 16)) / 4;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {SKILLS.map((sk) => {
          const points = sorted.map((a, i) => ({ i, v: a.assessment_scores.find((s) => s.skill === sk.key)?.score ?? null }))
            .filter((p): p is { i: number; v: number } => p.v !== null);
          return (
            <figure key={sk.key} className="rounded-xl border border-border p-3">
              <figcaption className="mb-1 text-sm font-semibold">{sk.label}</figcaption>
              {points.length === 0 ? <p className="text-xs text-muted">Sem avaliações deste fundamento.</p> : (
                <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full text-primary" aria-hidden>
                  {[1, 3, 5].map((v) => <line key={v} x1={0} x2={w} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 4" />)}
                  {points.length > 1 ? (
                    <polyline fill="none" stroke="currentColor" strokeWidth={2.5} points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
                  ) : null}
                  {points.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} fill="currentColor" />)}
                </svg>
              )}
            </figure>
          );
        })}
      </div>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer font-semibold text-link">Ver tabela de notas</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Notas por fundamento e data da avaliação</caption>
            <thead>
              <tr><th scope="col" className="py-1 pr-3">Fundamento</th>{sorted.map((a) => <th key={a.id} scope="col" className="px-2 py-1">{formatDate(a.assessed_on)}</th>)}</tr>
            </thead>
            <tbody>
              {SKILLS.map((sk) => (
                <tr key={sk.key} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-medium">{sk.label}</th>
                  {sorted.map((a) => <td key={a.id} className="px-2 py-1">{a.assessment_scores.find((s) => s.skill === sk.key)?.score ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
