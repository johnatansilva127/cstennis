import type { Metadata } from "next";
import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { addDays, isValidDate, todayInTz } from "@/lib/dates";
import { MATCH_OUTCOME } from "@/lib/labels";
import type { Database } from "@/lib/database.types";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MatchStatsGrid, MatchSummary, type MatchRow, type MatchStats } from "@/components/matches";

export const metadata: Metadata = { title: "Jogos dos alunos" };

export default async function MatchesPage({ searchParams }: PageProps<"/professor/jogos">) {
  const sp = await searchParams;
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const from = typeof sp.de === "string" && isValidDate(sp.de) ? sp.de : addDays(today, -90);
  const to = typeof sp.ate === "string" && isValidDate(sp.ate) ? sp.ate : today;
  const studentId = typeof sp.aluno === "string" && /^[0-9a-f-]{36}$/.test(sp.aluno) ? sp.aluno : "";
  const outcome = typeof sp.resultado === "string" && sp.resultado in MATCH_OUTCOME ? sp.resultado : "";
  let q = supabase.from("student_matches").select("*, match_sets(*), students(full_name), match_coach_comments(id)")
    .gte("played_on", from).lte("played_on", to).order("played_on", { ascending: false }).limit(200);
  if (studentId) q = q.eq("student_id", studentId);
  if (outcome) q = q.eq("outcome", outcome as Database["public"]["Enums"]["match_outcome"]);
  const [matches, students, stats] = await Promise.all([
    q,
    supabase.from("students").select("id, full_name").order("full_name"),
    studentId ? supabase.rpc("match_stats", { p_student_id: studentId, p_from: from, p_to: to }) : Promise.resolve({ data: null }),
  ]);
  type Row = MatchRow & { students: { full_name: string }; match_coach_comments: { id: string }[] };
  return (
    <>
      <PageHeader title="Jogos dos alunos" description="Relatos dos alunos e responsáveis. Você comenta; o relato não é alterado." />
      <form method="get" className="mb-4 grid gap-2 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-5">
        <label className="text-sm"><span className="label-caps block text-muted">Aluno</span>
          <select name="aluno" defaultValue={studentId} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3">
            <option value="">Todos</option>{(students.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select></label>
        <label className="text-sm"><span className="label-caps block text-muted">De</span>
          <input type="date" name="de" defaultValue={from} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3" /></label>
        <label className="text-sm"><span className="label-caps block text-muted">Até</span>
          <input type="date" name="ate" defaultValue={to} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3" /></label>
        <label className="text-sm"><span className="label-caps block text-muted">Resultado</span>
          <select name="resultado" defaultValue={outcome} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3">
            <option value="">Todos</option>{Object.entries(MATCH_OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></label>
        <div className="flex items-end"><button type="submit" className={buttonClasses("secondary", "md", true)}>Filtrar</button></div>
      </form>
      {stats.data ? <div className="mb-5"><MatchStatsGrid s={stats.data as MatchStats} /></div> : null}
      {(matches.data ?? []).length === 0 ? <EmptyState title="Nenhum jogo no período" /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {((matches.data ?? []) as unknown as Row[]).map((m) => (
            <li key={m.id}>
              <Link href={`/professor/jogos/${m.id}`} className="block px-4 py-3 hover:bg-surface-2">
                <p className="text-xs font-semibold uppercase text-muted">{m.students.full_name}{m.match_coach_comments.length ? " · comentado" : ""}</p>
                <MatchSummary m={m} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
