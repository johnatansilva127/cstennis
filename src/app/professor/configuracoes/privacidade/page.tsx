import type { Metadata } from "next";
import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { PRIVACY_KIND } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { privacySettingsAction, resolvePrivacyAction } from "../actions";

export const metadata: Metadata = { title: "Privacidade" };

export default async function PrivacySettingsPage() {
  const { supabase, org } = await requireCoach();
  const [{ data: o }, { data: requests }] = await Promise.all([
    supabase.from("organizations").select("privacy_controller, privacy_contact, proof_retention_days").single(),
    supabase.from("privacy_requests").select("id, kind, details, status, resolution, created_at, student_id, students(full_name)").order("created_at", { ascending: false }).limit(50),
  ]);
  type R = { id: string; kind: string; details: string | null; status: string; resolution: string | null; created_at: string; student_id: string | null; students: { full_name: string } | null };
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Privacidade"
        description={<>Preencha os dados do aviso de privacidade (<Link href="/privacidade" className="font-semibold text-link">ver página pública</Link>). O texto precisa de revisão pelo responsável do projeto.</>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Aviso e retenção" />
          <ActionForm action={privacySettingsAction} submitLabel="Salvar">
            <TextField name="privacy_controller" label="Controlador dos dados (nome)" defaultValue={o?.privacy_controller} />
            <TextField name="privacy_contact" label="Contato para assuntos de privacidade" defaultValue={o?.privacy_contact} />
            <TextField name="proof_retention_days" type="number" min={30} label="Excluir arquivos de comprovantes após (dias da quitação)"
              defaultValue={o?.proof_retention_days ?? ""} hint="Vazio = manter. O registro do pagamento continua existindo; só o arquivo é removido." />
          </ActionForm>
          <Alert tone="info" className="mt-4">
            Exportação e anonimização de um aluno ficam na aba “Histórico” da ficha do aluno e exigem confirmação em duas etapas.
            Não definimos prazos legais de retenção: decida com orientação adequada.
          </Alert>
        </Card>
        <Card>
          <CardHeader title="Solicitações recebidas" />
          {(requests ?? []).length === 0 ? <EmptyState title="Nenhuma solicitação" /> : (
            <ul className="space-y-3">
              {((requests ?? []) as unknown as R[]).map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {PRIVACY_KIND[r.kind]} {r.students ? <Link href={`/professor/alunos/${r.student_id}?aba=historico`} className="text-link">· {r.students.full_name}</Link> : null}
                    <StatusBadge tone={r.status === "completed" ? "success" : r.status === "rejected" ? "neutral" : "warning"}>
                      {r.status === "open" ? "Aberta" : r.status === "in_progress" ? "Em andamento" : r.status === "completed" ? "Concluída" : "Recusada"}
                    </StatusBadge>
                  </p>
                  <p className="text-muted">{formatDateTime(r.created_at, org.timezone)}{r.details ? ` · ${r.details}` : ""}</p>
                  {r.resolution ? <p className="mt-1">Resolução: {r.resolution}</p> : null}
                  {r.status === "open" || r.status === "in_progress" ? (
                    <div className="mt-2">
                      <ActionForm action={resolvePrivacyAction.bind(null, r.id)} submitLabel="Atualizar">
                        <SelectField name="status" label="Situação" defaultValue={r.status} options={[
                          { value: "in_progress", label: "Em andamento" }, { value: "completed", label: "Concluída" }, { value: "rejected", label: "Recusada" },
                        ]} />
                        <TextAreaField name="resolution" label="Resolução / resposta" rows={2} />
                      </ActionForm>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
