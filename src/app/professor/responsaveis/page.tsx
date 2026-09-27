import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm, TextField } from "@/components/ui/form";
import { Disclosure } from "@/components/ui/disclosure";
import { createGuardianAction } from "./actions";

export const metadata: Metadata = { title: "Responsáveis" };

export default async function GuardiansPage() {
  const { supabase } = await requireCoach();
  const [guardians, links] = await Promise.all([
    supabase.from("guardians").select("id, full_name, email, phone, user_id, status").order("full_name"),
    supabase.from("guardian_student_links").select("guardian_id, students(full_name)").is("revoked_at", null),
  ]);
  type L = { guardian_id: string; students: { full_name: string } };
  const kids = new Map<string, string[]>();
  for (const l of (links.data ?? []) as unknown as L[]) kids.set(l.guardian_id, [...(kids.get(l.guardian_id) ?? []), l.students.full_name]);
  return (
    <>
      <PageHeader title="Responsáveis" description="Cada responsável tem conta própria e vê apenas as crianças vinculadas por você." />
      <div className="space-y-4">
        {(guardians.data ?? []).length === 0 ? <EmptyState title="Nenhum responsável cadastrado" description="Responsáveis costumam ser cadastrados junto com a criança." /> : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {(guardians.data ?? []).map((g) => (
              <li key={g.id}>
                <Link href={`/professor/responsaveis/${g.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{g.full_name}</span>
                    <span className="block truncate text-sm text-muted">{(kids.get(g.id) ?? []).join(", ") || "Sem crianças vinculadas"}</span>
                  </span>
                  <StatusBadge tone={g.user_id ? "success" : "neutral"}>{g.user_id ? "Com acesso" : "Sem acesso"}</StatusBadge>
                  <ChevronRight aria-hidden className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Card>
          <Disclosure summary="Cadastrar responsável">
            <ActionForm action={createGuardianAction} submitLabel="Cadastrar">
              <TextField name="full_name" label="Nome" required />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="email" type="email" label="E-mail" />
                <TextField name="phone" type="tel" label="Telefone" />
              </div>
            </ActionForm>
          </Disclosure>
        </Card>
      </div>
    </>
  );
}
