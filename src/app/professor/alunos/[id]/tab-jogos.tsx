import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { MatchStatsGrid, MatchSummary, type MatchRow, type MatchStats } from "@/components/matches";
import type { TabProps } from "./types";

export async function TabJogos({ studentId, supabase, today }: TabProps) {
  const [matches, stats] = await Promise.all([
    supabase.from("student_matches").select("*, match_sets(*)").eq("student_id", studentId).order("played_on", { ascending: false }).limit(50),
    supabase.rpc("match_stats", { p_student_id: studentId, p_from: "2000-01-01", p_to: today }),
  ]);
  return (
    <div className="space-y-5">
      {stats.data ? <MatchStatsGrid s={stats.data as MatchStats} /> : null}
      <Card>
        <CardHeader title="Jogos registrados" description="Registrados pelo aluno ou responsável. Você pode comentar, mas não alterar o relato." />
        {(matches.data ?? []).length === 0 ? <EmptyState title="Nenhum jogo registrado" /> : (
          <ul className="divide-y divide-border">
            {((matches.data ?? []) as MatchRow[]).map((m) => (
              <li key={m.id}>
                <Link href={`/professor/jogos/${m.id}`} className="block py-3 hover:bg-surface-2"><MatchSummary m={m} /></Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
