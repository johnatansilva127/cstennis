import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, SelectField, TextField } from "@/components/ui/form";
import { GenerateInviteButton } from "@/components/generate-invite";
import { createInviteAction, revokeAccessAction, unlinkGuardianAction } from "../../alunos/[id]/actions";
import { linkChildAction, updateGuardianAction } from "../actions";

export const metadata: Metadata = { title: "Responsável" };

export default async function GuardianPage({ params }: PageProps<"/professor/responsaveis/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireCoach();
  const { data: g } = await supabase.from("guardians").select("*").eq("id", id).maybeSingle();
  if (!g) notFound();
  const [links, children, invite] = await Promise.all([
    supabase.from("guardian_student_links").select("id, relationship, students(id, full_name)").eq("guardian_id", id).is("revoked_at", null),
    supabase.from("students").select("id, full_name").eq("kind", "child").neq("status", "archived").order("full_name"),
    supabase.from("invitations").select("id, expires_at").eq("guardian_id", id).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);
  type L = { id: string; relationship: string | null; students: { id: string; full_name: string } };
  const linked = (links.data ?? []) as unknown as L[];
  return (
    <>
      <PageHeader back={{ href: "/professor/responsaveis", label: "Responsáveis" }} title={g.full_name}
        description={<StatusBadge tone={g.user_id ? "success" : invite.data ? "info" : "neutral"}>{g.user_id ? "Com acesso ativo" : invite.data ? `Convite pendente até ${formatDateTime(invite.data.expires_at, org.timezone)}` : "Sem acesso"}</StatusBadge>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dados" />
          <ActionForm action={updateGuardianAction.bind(null, id)} submitLabel="Salvar">
            <TextField name="full_name" label="Nome" defaultValue={g.full_name} required />
            <TextField name="email" type="email" label="E-mail" defaultValue={g.email} hint={g.user_id ? "O e-mail de uma conta ativa não pode ser trocado aqui." : undefined} />
            <TextField name="phone" type="tel" label="Telefone" defaultValue={g.phone} />
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Acesso" />
          {g.user_id ? (
            <Disclosure summary="Revogar acesso do responsável">
              <ActionForm action={revokeAccessAction.bind(null, "guardian", id)} submitLabel="Revogar acesso" submitVariant="danger"
                confirm="O responsável perderá o acesso a todas as crianças. Continuar?">
                <TextField name="reason" label="Motivo" required />
              </ActionForm>
            </Disclosure>
          ) : g.email ? (
            <GenerateInviteButton action={createInviteAction.bind(null, "guardian", id)} appUrl={env().APP_URL} who={g.full_name}
              label={invite.data ? "Gerar novo link" : "Gerar convite"} />
          ) : <p className="text-sm text-muted">Cadastre um e-mail para gerar convite.</p>}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Crianças vinculadas" description="O responsável só vê dados das crianças listadas aqui." />
          <ul className="mb-4 space-y-2">
            {linked.map((l) => (
              <li key={l.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/professor/alunos/${l.students.id}`} className="font-semibold text-link">{l.students.full_name}</Link>
                  {l.relationship ? <span className="text-sm text-muted">{l.relationship}</span> : null}
                </div>
                <div className="mt-2">
                  <Disclosure summary="Revogar vínculo">
                    <ActionForm action={unlinkGuardianAction.bind(null, l.id)} submitLabel="Revogar" submitVariant="danger"
                      confirm="O responsável deixará de ver esta criança. Continuar?">
                      <TextField name="reason" label="Motivo" required />
                    </ActionForm>
                  </Disclosure>
                </div>
              </li>
            ))}
          </ul>
          <Disclosure summary="Vincular outra criança">
            <ActionForm action={linkChildAction.bind(null, id)} submitLabel="Vincular" resetOnSuccess>
              <SelectField name="student_id" label="Criança" required placeholder="Selecione"
                options={(children.data ?? []).filter((c) => !linked.some((l) => l.students.id === c.id)).map((c) => ({ value: c.id, label: c.full_name }))} />
              <TextField name="relationship" label="Parentesco (opcional)" />
            </ActionForm>
          </Disclosure>
        </Card>
      </div>
    </>
  );
}
