import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { todayInTz } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MatchStatsGrid, MatchSummary, type MatchRow, type MatchStats } from "@/components/matches";
import { RestrictedNotice } from "@/components/restricted";

export const metadata: Metadata = { title: "Meus jogos" };

export default async function ParticipantMatches() {
  const { supabase, student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Jogos" /><RestrictedNotice who={who} /></>;
  const today = todayInTz(tz);
  const [matches, stats] = await Promise.all([
    supabase.from("student_matches").select("*, match_sets(*), match_coach_comments(id)").eq("student_id", student.id).order("played_on", { ascending: false }).limit(100),
    supabase.rpc("match_stats", { p_student_id: student.id, p_from: "2000-01-01", p_to: today }),
  ]);
  type Row = MatchRow & { match_coach_comments: { id: string }[] };
  return (
    <>
      <PageHeader title={who === "você" ? "Meus jogos" : `Jogos de ${who}`} description="Registre partidas fora das aulas; o professor acompanha e comenta."
        actions={<ButtonLink href="/app/jogos/novo"><Plus aria-hidden className="size-4" /> Registrar jogo</ButtonLink>} />
      {stats.data ? <div className="mb-5"><MatchStatsGrid s={stats.data as MatchStats} /></div> : null}
      {(matches.data ?? []).length === 0 ? <EmptyState title="Nenhum jogo registrado" action={<ButtonLink href="/app/jogos/novo">Registrar o primeiro</ButtonLink>} /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {((matches.data ?? []) as unknown as Row[]).map((m) => (
            <li key={m.id}>
              <Link href={`/app/jogos/${m.id}`} className="block px-4 py-3 hover:bg-surface-2">
                <MatchSummary m={m} />
                {m.match_coach_comments.length ? <p className="mt-1 text-xs font-semibold text-link">Comentário do professor</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
