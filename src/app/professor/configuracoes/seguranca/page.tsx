import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, TextField } from "@/components/ui/form";
import { MfaEnrollForm } from "@/app/(auth)/mfa/mfa-forms";
import { signOutOthersAction } from "@/app/profile-actions";
import { removeFactorAction } from "../actions";

export const metadata: Metadata = { title: "Segurança" };

export default async function SecurityPage() {
  const { supabase, org } = await requireCoach();
  const { data } = await supabase.auth.mfa.listFactors();
  const factors = data?.totp ?? [];
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Segurança"
        description="A verificação em duas etapas é obrigatória para o professor." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Autenticadores" />
          <ul className="space-y-3">
            {factors.map((f) => (
              <li key={f.id} className="rounded-xl border border-border p-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{f.friendly_name ?? "Autenticador"} <StatusBadge tone="success">Ativo</StatusBadge></p>
                <p className="text-sm text-muted">Configurado em {formatDateTime(f.created_at, org.timezone)}</p>
                {factors.length > 1 ? (
                  <div className="mt-2">
                    <Disclosure summary="Remover este autenticador">
                      <ActionForm action={removeFactorAction.bind(null, f.id)} submitLabel="Remover" submitVariant="danger">
                        <TextField name="mfa_code" label="Código atual do autenticador" inputMode="numeric" maxLength={6} required />
                      </ActionForm>
                    </Disclosure>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Alert tone="info" className="mt-4" title="Recomendado: cadastre um segundo aparelho">
            Com dois autenticadores, a perda de um celular não bloqueia seu acesso. Sem nenhum, a recuperação exige o
            procedimento administrativo descrito em docs/OPERACAO.md (verificação de identidade e registro).
          </Alert>
          <div className="mt-4">
            <Disclosure summary="Adicionar outro autenticador">
              <MfaEnrollForm next="/professor/configuracoes/seguranca" />
            </Disclosure>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sessões" />
          <ActionForm action={signOutOthersAction} submitLabel="Encerrar sessões em outros aparelhos" submitVariant="secondary">
            <p className="text-sm text-muted">Sessões expiram automaticamente por inatividade. Use esta opção se suspeitar de acesso indevido.</p>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
