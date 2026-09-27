import type { Metadata } from "next";
import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm } from "@/components/ui/form";
import { revokeInviteAction } from "../alunos/[id]/actions";

export const metadata: Metadata = { title: "Convites" };

export default async function InvitesPage() {
  const { supabase, org } = await requireCoach();
  const { data } = await supabase.from("invitations")
    .select("id, kind, email, status, expires_at, created_at, accepted_at, failed_attempts, student_id, guardian_id, students(full_name), guardians(full_name)")
    .order("created_at", { ascending: false }).limit(100);
  const now = new Date().toISOString();
  type I = { id: string; kind: string; email: string; status: string; expires_at: string; created_at: string; accepted_at: string | null; failed_attempts: number;
    student_id: string | null; guardian_id: string | null; students: { full_name: string } | null; guardians: { full_name: string } | null };
  return (
    <>
      <PageHeader title="Convites" description="Links de uso único, válidos por tempo limitado. O link completo só aparece no momento em que é gerado." />
      {(data ?? []).length === 0 ? <EmptyState title="Nenhum convite gerado" description="Gere convites pela ficha do aluno ou do responsável." /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {((data ?? []) as unknown as I[]).map((i) => {
            const expired = i.status === "pending" && i.expires_at <= now;
            const locked = i.status === "pending" && i.failed_attempts >= 5;
            const tone = i.status === "accepted" ? "success" : i.status === "revoked" || expired || locked ? "neutral" : "info";
            const label = i.status === "accepted" ? "Aceito" : i.status === "revoked" ? "Revogado" : locked ? "Bloqueado" : expired ? "Expirado" : "Pendente";
            const name = i.kind === "student" ? i.students?.full_name : i.guardians?.full_name;
            const href = i.kind === "student" ? `/professor/alunos/${i.student_id}` : `/professor/responsaveis/${i.guardian_id}`;
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <Link href={href} className="font-semibold text-link">{name}</Link>
                  <span className="block text-muted">{i.kind === "student" ? "Aluno" : "Responsável"} · {i.email} · criado {formatDateTime(i.created_at, org.timezone)}
                    {i.status === "pending" && !expired ? ` · expira ${formatDateTime(i.expires_at, org.timezone)}` : ""}
                    {i.accepted_at ? ` · aceito ${formatDateTime(i.accepted_at, org.timezone)}` : ""}</span>
                </span>
                <StatusBadge tone={tone}>{label}</StatusBadge>
                {i.status === "pending" && !expired ? (
                  <ActionForm action={revokeInviteAction.bind(null, i.id)} submitLabel="Revogar" submitVariant="secondary" submitFull={false}>
                    <span className="sr-only">Revogar convite</span>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
