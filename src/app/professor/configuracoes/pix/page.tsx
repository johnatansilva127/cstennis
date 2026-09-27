import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { displayPixKey, PIX_KEY_LABELS, type PixKeyType } from "@/lib/pix/keys";
import { pixQr } from "@/lib/pix/qr";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/status";
import { ActionForm, CheckboxField, SelectField, TextField } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/copy-button";
import { updatePixAction } from "../actions";

export const metadata: Metadata = { title: "Dados Pix" };

export default async function PixSettingsPage() {
  const { supabase, org } = await requireCoach();
  const { data: pix } = await supabase.from("pix_settings").select("*").maybeSingle();
  const test = pix ? await pixQr({ pixKey: pix.pix_key, receiverName: pix.receiver_name, city: pix.city, amountCents: 1 }) : null;
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Dados Pix"
        description="Exibidos ao aluno/responsável na hora de pagar. O pagamento acontece no app do banco; você confere e aprova." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recebedor" description={pix ? `Atualizado em ${formatDateTime(pix.updated_at, org.timezone)}` : "Ainda não configurado"} />
          <ActionForm action={updatePixAction} submitLabel="Salvar dados Pix" pendingLabel="Salvando…">
            <TextField name="receiver_name" label="Nome do recebedor (como aparece no banco)" defaultValue={pix?.receiver_name} required maxLength={60} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField name="key_type" label="Tipo de chave" defaultValue={pix?.key_type ?? "evp"} required
                options={Object.entries(PIX_KEY_LABELS).map(([value, label]) => ({ value, label }))} />
              <TextField name="pix_key" label="Chave Pix" defaultValue={pix ? displayPixKey(pix.key_type as PixKeyType, pix.pix_key) : ""} required />
            </div>
            <TextField name="city" label="Cidade do recebedor" defaultValue={pix?.city ?? ""} required maxLength={15} hint="Usada no Pix Copia e Cola (até 15 caracteres)." />
            <CheckboxField name="brcode_enabled" defaultChecked={pix?.brcode_enabled}
              label="Exibir QR Code e Pix Copia e Cola aos pagadores"
              hint="Ative somente depois de testar o código de teste ao lado no app do seu banco." />
            <TextField name="mfa_code" label="Código do autenticador" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
              hint="Alterar dados de recebimento exige confirmação em duas etapas. A mudança é auditada." />
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Teste do Pix Copia e Cola" description="Payload estático gerado no padrão BR Code com valor de R$ 0,01." />
          {!pix ? <p className="text-sm text-muted">Configure os dados primeiro.</p> : test ? (
            <div className="space-y-3">
              <Alert tone="info">Abra o app do seu banco, leia o QR (ou cole o código) e confira nome do recebedor e valor. Não é preciso concluir o pagamento.</Alert>
              <div className="flex justify-center rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={test.dataUrl} alt="QR Code Pix de teste (R$ 0,01)" width={220} height={220} />
              </div>
              <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs">{test.payload}</p>
              <CopyButton value={test.payload} label="Copiar código de teste" />
            </div>
          ) : <Alert tone="warning">Não foi possível gerar um payload válido com estes dados.</Alert>}
        </Card>
      </div>
    </>
  );
}
