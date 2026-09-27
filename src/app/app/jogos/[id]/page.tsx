import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { formatDateTime, todayInTz } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AccessDenied } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm } from "@/components/ui/form";
import { MatchSummary, type MatchRow } from "@/components/matches";
import { RestrictedNotice } from "@/components/restricted";
import { MatchForm } from "../match-form";
import { deleteMatchAction, saveMatchAction } from "../actions";

export const metadata: Metadata = { title: "Jogo" };

export default async function MatchPage({ params }: PageProps<"/app/jogos/[id]">) {
  const { id } = await params;
  const { supabase, student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Jogo" /><RestrictedNotice who={who} /></>;
  const { data: m } = await supabase.from("student_matches").select("*, match_sets(*), match_coach_comments(id, body, created_at, updated_at)")
    .eq("id", id).eq("student_id", student.id).maybeSingle();
  if (!m) return <><PageHeader title="Jogo" back={{ href: "/app/jogos", label: "Jogos" }} /><AccessDenied backHref="/app/jogos" /></>;
  const sets = [...(m.match_sets ?? [])].sort((a, b) => a.set_number - b.set_number);
  const comments = [...(m.match_coach_comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resultKind = m.outcome_source === "computed" ? "completed" : m.outcome;
  return (
    <>
      <PageHeader back={{ href: "/app/jogos", label: "Jogos" }} title={`vs ${m.opponent_name}`}
        description={`Registrado em ${formatDateTime(m.created_at, tz)} por ${m.author_kind === "guardian" ? "responsável" : "aluno"}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <MatchSummary m={m as unknown as MatchRow} />
          {m.comments ? <p className="mt-3 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{m.comments}</p> : null}
        </Card>
        <Card>
          <CardHeader title="Comentários do professor" />
          {comments.length === 0 ? <p className="text-sm text-muted">Ainda sem comentários.</p> : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-xl bg-info-bg p-3 text-sm">
                  <p className="whitespace-pre-line text-text">{c.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDateTime(c.created_at, tz)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-5 space-y-3">
        <Disclosure summary="Editar jogo">
          <MatchForm action={saveMatchAction.bind(null, student.id, id)} today={todayInTz(tz)}
            initial={{ played_on: m.played_on, event_name: m.event_name, opponent_name: m.opponent_name, match_type: m.match_type,
              partner_name: m.partner_name, opponent2_name: m.opponent2_name, format: m.format, result_kind: resultKind,
              manual_outcome: m.outcome_source === "manual" ? m.outcome : null, comments: m.comments, sets }} />
        </Disclosure>
        {comments.length === 0 ? (
          <Disclosure summary="Apagar jogo">
            <ActionForm action={deleteMatchAction.bind(null, id)} submitLabel="Apagar" submitVariant="danger" confirm="Apagar este jogo?">
              <p className="text-sm text-muted">Jogos com comentário do professor não podem ser apagados.</p>
            </ActionForm>
          </Disclosure>
        ) : null}
      </div>
    </>
  );
}
