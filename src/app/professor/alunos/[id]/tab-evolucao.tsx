import Link from "next/link";
import { Plus } from "lucide-react";
import { ActionForm, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { ButtonLink } from "@/components/ui/button";
import { LatestScores, SkillTimeline, type AssessmentWithScores } from "@/components/evolution";
import { formatDate } from "@/lib/dates";
import { GOAL_STATUS } from "@/lib/labels";
import type { TabProps } from "./types";
import { saveGoalAction } from "./actions";

export async function TabEvolucao({ studentId, supabase }: TabProps) {
  const [assessments, goals] = await Promise.all([
    supabase.from("assessments").select("id, assessed_on, status, summary, published_at, updated_at, assessment_scores(skill, score, comment)")
      .eq("student_id", studentId).order("assessed_on", { ascending: false }),
    supabase.from("goals").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
  ]);
  const list = (assessments.data ?? []) as AssessmentWithScores[];
  const published = list.filter((a) => a.status === "published");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Avaliações técnicas"
          action={<ButtonLink href={`/professor/alunos/${studentId}/avaliacoes/nova`} size="sm"><Plus aria-hidden className="size-4" /> Nova</ButtonLink>} />
        {list.length === 0 ? <EmptyState title="Nenhuma avaliação" description="Crie um rascunho e publique quando estiver pronto." /> : (
          <ul className="divide-y divide-border">
            {list.map((a) => (
              <li key={a.id}>
                <Link href={`/professor/alunos/${studentId}/avaliacoes/${a.id}`} className="flex min-h-12 items-center gap-2 py-2 text-sm">
                  <span className="flex-1 font-semibold">{formatDate(a.assessed_on)}</span>
                  <span className="text-muted">{a.assessment_scores.filter((s) => s.score !== null).length} fundamentos</span>
                  <StatusBadge tone={a.status === "published" ? "success" : "neutral"}>{a.status === "published" ? "Publicada" : "Rascunho"}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Última avaliação publicada" description="É o que o aluno/responsável vê." />
        {published[0] ? <LatestScores assessment={published[0]} /> : <p className="text-sm text-muted">Nenhuma avaliação publicada.</p>}
      </Card>
      {published.length > 1 ? (
        <Card className="lg:col-span-2">
          <CardHeader title="Evolução por fundamento" description="Somente datas com nota registrada aparecem." />
          <SkillTimeline assessments={published} />
        </Card>
      ) : null}
      <Card className="lg:col-span-2">
        <CardHeader title="Metas" />
        <div className="space-y-3">
          {(goals.data ?? []).map((g) => (
            <Disclosure key={g.id} summary={
              <span className="flex flex-wrap items-center gap-2">
                <span>{g.description}</span>
                <StatusBadge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</StatusBadge>
                {!g.visible_to_student ? <StatusBadge tone="neutral">Privada</StatusBadge> : null}
              </span>
            }>
              <GoalForm studentId={studentId} goal={g} />
            </Disclosure>
          ))}
          <Disclosure summary="Nova meta">
            <GoalForm studentId={studentId} />
          </Disclosure>
        </div>
      </Card>
    </div>
  );
}

function GoalForm({ studentId, goal }: { studentId: string; goal?: { id: string; description: string; target_date: string | null; status: string; visible_to_student: boolean } }) {
  return (
    <ActionForm action={saveGoalAction.bind(null, goal?.id ?? null, studentId)} submitLabel="Salvar meta" resetOnSuccess={!goal}>
      <TextAreaField name="description" label="Descrição" defaultValue={goal?.description} required rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="target_date" type="date" label="Data-alvo (opcional)" defaultValue={goal?.target_date} />
        <SelectField name="status" label="Situação" defaultValue={goal?.status ?? "open"}
          options={Object.entries(GOAL_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
      </div>
      <CheckboxField name="visible" label="Visível para o aluno/responsável" defaultChecked={goal?.visible_to_student ?? true} />
    </ActionForm>
  );
}
