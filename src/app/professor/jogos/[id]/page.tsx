import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, TextAreaField } from "@/components/ui/form";
import { MatchSummary, type MatchRow } from "@/components/matches";
import { addCommentAction, editCommentAction } from "../actions";

export const metadata: Metadata = { title: "Jogo" };

export default async function CoachMatchPage({ params }: PageProps<"/professor/jogos/[id]">) {
  const { id } = await params;
  const { supabase, org, ctx } = await requireCoach();
  const { data: m } = await supabase.from("student_matches").select("*, match_sets(*), students(id, full_name), match_coach_comments(*)").eq("id", id).maybeSingle();
  if (!m) notFound();
  const comments = [...(m.match_coach_comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <>
      <PageHeader back={{ href: `/professor/jogos?aluno=${m.student_id}`, label: "Jogos" }} eyebrow={m.students?.full_name} title={`vs ${m.opponent_name}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Relato do jogo" description={`Registrado por ${m.author_kind === "guardian" ? "responsável" : "aluno"} em ${formatDateTime(m.created_at, org.timezone)}${m.updated_at !== m.created_at ? ` · editado em ${formatDateTime(m.updated_at, org.timezone)}` : ""}`} />
          <MatchSummary m={m as unknown as MatchRow} />
          {m.comments ? <p className="mt-3 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{m.comments}</p> : null}
        </Card>
        <Card>
          <CardHeader title="Orientações do professor" />
          <ul className="mb-4 space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="whitespace-pre-line">{c.body}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(c.created_at, org.timezone)}{c.updated_at !== c.created_at ? " · editado" : ""}</p>
                {c.author_user_id === ctx.user_id ? (
                  <div className="mt-2">
                    <Disclosure summary="Editar comentário">
                      <ActionForm action={editCommentAction.bind(null, c.id)} submitLabel="Salvar">
                        <TextAreaField name="body" label="Comentário" defaultValue={c.body} required />
                      </ActionForm>
                    </Disclosure>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <ActionForm action={addCommentAction.bind(null, id)} submitLabel="Publicar comentário" resetOnSuccess>
            <TextAreaField name="body" label="Novo comentário" required rows={4} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
