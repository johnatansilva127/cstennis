import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { formatDate } from "@/lib/dates";
import { GOAL_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { LatestScores, SkillTimeline, type AssessmentWithScores } from "@/components/evolution";
import { RestrictedNotice } from "@/components/restricted";

export const metadata: Metadata = { title: "Evolução" };

export default async function EvolutionPage() {
  const { supabase, student, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Evolução" /><RestrictedNotice who={who} /></>;
  const [assessments, goals] = await Promise.all([
    supabase.from("assessments").select("id, assessed_on, status, summary, published_at, updated_at, assessment_scores(skill, score, comment)")
      .eq("student_id", student.id).order("assessed_on", { ascending: false }),
    supabase.from("goals").select("id, description, target_date, status").eq("student_id", student.id).order("created_at", { ascending: false }),
  ]);
  const list = (assessments.data ?? []) as AssessmentWithScores[];
  return (
    <>
      <PageHeader title="Evolução" description="Avaliações do professor em escala de 1 a 5. Fundamentos não avaliados não recebem nota." />
      {list.length === 0 ? <EmptyState title="Nenhuma avaliação publicada ainda" description="Quando o professor publicar uma avaliação, ela aparece aqui." /> : (
        <div className="space-y-5">
          <Card>
            <CardHeader title={`Avaliação de ${formatDate(list[0].assessed_on)}`}
              description={list[0].updated_at !== list[0].published_at ? `Atualizada em ${formatDate(list[0].updated_at.slice(0, 10))}` : undefined} />
            {list[0].summary ? <p className="mb-4 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{list[0].summary}</p> : null}
            <LatestScores assessment={list[0]} />
          </Card>
          {list.length > 1 ? (
            <Card>
              <CardHeader title="Linha do tempo" description="Pontos somente onde há nota registrada." />
              <SkillTimeline assessments={list} />
            </Card>
          ) : null}
          {list.length > 1 ? (
            <Card>
              <CardHeader title="Avaliações anteriores" />
              <ul className="space-y-3">
                {list.slice(1).map((a) => (
                  <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-semibold">{formatDate(a.assessed_on)}</p>
                    {a.summary ? <p className="mt-1 whitespace-pre-line text-muted">{a.summary}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
      <Card className="mt-5">
        <CardHeader title="Metas" />
        {(goals.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma meta definida.</p> : (
          <ul className="space-y-2">
            {(goals.data ?? []).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <span className="font-medium">{g.description}{g.target_date ? <span className="block text-xs text-muted">Até {formatDate(g.target_date)}</span> : null}</span>
                <StatusBadge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
