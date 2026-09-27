import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { formatDateTime, todayInTz } from "@/lib/dates";
import { SCORE_SCALE, SKILLS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import { deleteDraftAction, saveAssessmentAction } from "./actions";

export const metadata: Metadata = { title: "Avaliação técnica" };

export default async function AssessmentPage({ params }: PageProps<"/professor/alunos/[id]/avaliacoes/[assessmentId]">) {
  const { id, assessmentId } = await params;
  const { supabase, org } = await requireCoach();
  const { data: student } = await supabase.from("students").select("id, full_name").eq("id", id).maybeSingle();
  if (!student) notFound();
  const isNew = assessmentId === "nova";
  let assessment: { id: string; assessed_on: string; status: string; summary: string | null; updated_at: string; published_at: string | null;
    assessment_scores: { skill: string; score: number | null; comment: string | null }[] } | null = null;
  let privateNote: string | null = null;
  if (!isNew) {
    const { data } = await supabase.from("assessments").select("id, assessed_on, status, summary, updated_at, published_at, assessment_scores(skill, score, comment)")
      .eq("id", assessmentId).eq("student_id", id).maybeSingle();
    if (!data) notFound();
    assessment = data;
    const { data: note } = await supabase.from("assessment_private_notes").select("note").eq("assessment_id", assessmentId).maybeSingle();
    privateNote = note?.note ?? null;
  }
  const score = (k: string) => assessment?.assessment_scores.find((s) => s.skill === k);
  const published = assessment?.status === "published";

  return (
    <>
      <PageHeader back={{ href: `/professor/alunos/${id}?aba=evolucao`, label: student.full_name }}
        title={isNew ? "Nova avaliação" : "Avaliação técnica"}
        description="Escala de 1 a 5 por fundamento. “Não avaliado” não conta como nota." />
      {published ? (
        <Alert tone="info" className="mb-4">
          Publicada em {formatDateTime(assessment!.published_at, org.timezone)}. Alterações ficam registradas no histórico e aparecem para o aluno.
        </Alert>
      ) : null}
      <ActionForm action={saveAssessmentAction.bind(null, id, isNew ? null : assessmentId)} hideSubmit>
        <Card>
          <TextField name="assessed_on" type="date" label="Data da avaliação" defaultValue={assessment?.assessed_on ?? todayInTz(org.timezone)} required />
        </Card>
        <Card>
          <CardHeader title="Fundamentos" description={SCORE_SCALE.map((s) => s.label).join(" · ")} />
          <div className="grid gap-5 sm:grid-cols-2">
            {SKILLS.map((sk) => (
              <fieldset key={sk.key} className="space-y-2 rounded-xl border border-border p-3">
                <legend className="px-1 font-semibold">{sk.label}</legend>
                <SelectField name={`score_${sk.key}`} label="Nota" defaultValue={score(sk.key)?.score?.toString() ?? ""} placeholder="Não avaliado"
                  options={SCORE_SCALE.map((s) => ({ value: String(s.value), label: `${s.label} — ${s.description}` }))} />
                <TextField name={`comment_${sk.key}`} label="Comentário (visível ao aluno)" defaultValue={score(sk.key)?.comment ?? ""} />
              </fieldset>
            ))}
          </div>
        </Card>
        <Card>
          <TextAreaField name="summary" label="Feedback para o aluno/responsável" defaultValue={assessment?.summary ?? ""} rows={4} />
          <div className="mt-4">
            <TextAreaField name="private_note" label="Observação privada do professor" defaultValue={privateNote ?? ""} rows={3}
              hint="Armazenada separadamente e nunca exibida ao aluno." />
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Salvando…">
            {published ? "Salvar alterações" : "Salvar rascunho"}
          </SubmitButton>
          {!published ? <SubmitButton name="intent" value="publish" pendingLabel="Publicando…">Salvar e publicar</SubmitButton> : null}
        </div>
      </ActionForm>
      {!isNew && !published ? (
        <div className="mt-6">
          <ActionForm action={deleteDraftAction.bind(null, id, assessmentId)} submitLabel="Apagar rascunho" submitVariant="danger" submitFull={false}
            confirm="Apagar este rascunho?">
            <span className="sr-only">Apagar rascunho</span>
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
