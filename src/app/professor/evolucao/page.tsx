import type { Metadata } from "next";
import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Evolução" };

export default async function EvolutionOverview() {
  const { supabase } = await requireCoach();
  const [students, assessments, goals] = await Promise.all([
    supabase.from("students").select("id, full_name").eq("status", "active").order("full_name"),
    supabase.from("assessments").select("student_id, assessed_on, status").order("assessed_on", { ascending: false }),
    supabase.from("goals").select("student_id, status").in("status", ["open", "in_progress"]),
  ]);
  const last = new Map<string, string>();
  const drafts = new Map<string, number>();
  for (const a of assessments.data ?? []) {
    if (a.status === "published" && !last.has(a.student_id)) last.set(a.student_id, a.assessed_on);
    if (a.status === "draft") drafts.set(a.student_id, (drafts.get(a.student_id) ?? 0) + 1);
  }
  const openGoals = new Map<string, number>();
  for (const g of goals.data ?? []) openGoals.set(g.student_id, (openGoals.get(g.student_id) ?? 0) + 1);
  return (
    <>
      <PageHeader title="Evolução" description="Avaliações técnicas e metas por aluno. Só avaliações publicadas aparecem para o aluno." />
      {(students.data ?? []).length === 0 ? <EmptyState title="Nenhum aluno ativo" /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {(students.data ?? []).map((s) => (
            <li key={s.id}>
              <Link href={`/professor/alunos/${s.id}?aba=evolucao`} className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-3 hover:bg-surface-2">
                <span className="flex-1 font-semibold">{s.full_name}</span>
                <span className="text-sm text-muted">{last.get(s.id) ? `Última avaliação: ${formatDate(last.get(s.id))}` : "Sem avaliação publicada"}</span>
                {drafts.get(s.id) ? <StatusBadge tone="neutral">{drafts.get(s.id)} rascunho(s)</StatusBadge> : null}
                {openGoals.get(s.id) ? <StatusBadge tone="info">{openGoals.get(s.id)} meta(s) em aberto</StatusBadge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
