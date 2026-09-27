import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search, UserPlus } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { STUDENT_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Alunos" };

export default async function StudentsPage({ searchParams }: PageProps<"/professor/alunos">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const status = typeof params.status === "string" ? params.status : "active";
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const [students, links, invites, glinks, overdue] = await Promise.all([
    supabase.from("students").select("id, full_name, kind, status, email, phone, level").order("full_name"),
    supabase.from("student_user_links").select("student_id").is("revoked_at", null),
    supabase.from("invitations").select("student_id, guardian_id").eq("status", "pending").gt("expires_at", new Date().toISOString()),
    supabase.from("guardian_student_links").select("student_id, guardians(id, full_name, user_id)").is("revoked_at", null),
    supabase.from("invoices").select("student_id").in("status", ["open", "under_review"]).lt("due_date", today),
  ]);
  if (students.error) throw new Error("Falha ao carregar alunos");
  const linked = new Set((links.data ?? []).map((l) => l.student_id));
  const invitedStudents = new Set((invites.data ?? []).map((i) => i.student_id).filter(Boolean));
  const invitedGuardians = new Set((invites.data ?? []).map((i) => i.guardian_id).filter(Boolean));
  const overdueSet = new Set((overdue.data ?? []).map((i) => i.student_id));
  type GL = { student_id: string; guardians: { id: string; full_name: string; user_id: string | null } | null };
  const guardiansBy = new Map<string, GL["guardians"][]>();
  for (const g of (glinks.data ?? []) as unknown as GL[]) {
    guardiansBy.set(g.student_id, [...(guardiansBy.get(g.student_id) ?? []), g.guardians]);
  }

  const list = (students.data ?? []).filter((s) =>
    (status === "all" || s.status === status) &&
    (!q || s.full_name.toLowerCase().includes(q) || (s.email ?? "").includes(q) || (s.phone ?? "").includes(q)));

  function access(s: { id: string; kind: string }) {
    if (s.kind === "adult") {
      if (linked.has(s.id)) return { tone: "success" as const, label: "Acesso ativo" };
      if (invitedStudents.has(s.id)) return { tone: "info" as const, label: "Convite enviado" };
      return { tone: "neutral" as const, label: "Sem acesso" };
    }
    const gs = guardiansBy.get(s.id) ?? [];
    if (gs.some((g) => g?.user_id)) return { tone: "success" as const, label: "Responsável com acesso" };
    if (gs.some((g) => g && invitedGuardians.has(g.id))) return { tone: "info" as const, label: "Convite ao responsável" };
    return { tone: "neutral" as const, label: gs.length ? "Responsável sem acesso" : "Sem responsável" };
  }

  return (
    <>
      <PageHeader title="Alunos" description="Cadastro, horários fixos, mensalidades e acesso."
        actions={<ButtonLink href="/professor/alunos/novo"><UserPlus aria-hidden className="size-4" /> Novo aluno</ButtonLink>} />
      <form method="get" className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">Buscar aluno</label>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Buscar por nome, e-mail ou telefone"
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-3 text-base" />
        </div>
        <label htmlFor="status" className="sr-only">Situação</label>
        <select id="status" name="status" defaultValue={status} className="min-h-11 rounded-xl border border-border-strong bg-surface px-3">
          <option value="active">Ativos</option>
          <option value="paused">Pausados</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </select>
        <button type="submit" className={buttonClasses("secondary")}>Filtrar</button>
      </form>

      {list.length === 0 ? (
        <EmptyState title={q ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
          description={q ? "Revise a busca ou o filtro de situação." : "Cadastre o primeiro aluno para começar."}
          action={<ButtonLink href="/professor/alunos/novo">Cadastrar aluno</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {list.map((s) => {
            const a = access(s);
            return (
              <li key={s.id}>
                <Link href={`/professor/alunos/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-bg font-display font-bold text-info" aria-hidden>
                    {s.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.full_name}</span>
                    <span className="block truncate text-sm text-muted">
                      {s.kind === "child" ? "Criança" : "Adulto"}{s.level ? ` · ${s.level}` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {status === "all" ? <StatusBadge tone={STUDENT_STATUS[s.status].tone}>{STUDENT_STATUS[s.status].label}</StatusBadge> : null}
                      <StatusBadge tone={a.tone}>{a.label}</StatusBadge>
                      {overdueSet.has(s.id) ? <StatusBadge tone="danger">Mensalidade em atraso</StatusBadge> : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
