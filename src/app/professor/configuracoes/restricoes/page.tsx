import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { RESTRICTION_MODE } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/status";
import { ActionForm, RadioGroupField, TextField } from "@/components/ui/form";
import { orgPolicyAction } from "../actions";

export const metadata: Metadata = { title: "Regras de atraso" };

export default async function RestrictionsPage() {
  const { supabase } = await requireCoach();
  const { data } = await supabase.from("access_policies").select("mode, grace_days").is("student_id", null).maybeSingle();
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Regras de atraso"
        description="Regra geral para mensalidades em atraso. Você pode definir exceções por aluno e liberar ou bloquear manualmente." />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <ActionForm action={orgPolicyAction} submitLabel="Salvar regra geral">
            <RadioGroupField name="mode" legend="Quando houver atraso" defaultValue={data?.mode ?? "warn_only"}
              options={Object.entries(RESTRICTION_MODE).map(([value, v]) => ({ value, label: v.label, description: v.description }))} />
            <TextField name="grace_days" type="number" min={0} max={60} label="Dias de tolerância" defaultValue={data?.grace_days ?? 0} required />
          </ActionForm>
        </Card>
        <div className="space-y-3">
          <Alert tone="info" title="Quando o bloqueio começa">
            Usamos a data do vencimento no horário de Brasília. Com tolerância de N dias, o bloqueio vale a partir do dia seguinte a
            (vencimento + N). Exemplo: vencimento em 10/10 e tolerância 0 → bloqueio a partir de 11/10, 00h00.
          </Alert>
          <Alert tone="warning" title="O que o bloqueio não faz">
            Não remove matrículas, não libera vagas e não cancela aulas confirmadas. Enviar comprovante não suspende o bloqueio:
            se quiser, dê uma liberação temporária na ficha do aluno enquanto confere.
          </Alert>
          <Alert tone="success" title="O que continua disponível">
            Mesmo no modo mais restrito o aluno/responsável entra no app para ver a dívida, copiar o Pix, enviar e acompanhar
            comprovantes, ler avisos, ver orientações de contato e privacidade e sair.
          </Alert>
        </div>
      </div>
    </>
  );
}
