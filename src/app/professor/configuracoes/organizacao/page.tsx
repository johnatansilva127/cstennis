import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ActionForm, TextAreaField, TextField } from "@/components/ui/form";
import { orgSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Organização" };

export default async function OrgSettingsPage() {
  const { supabase } = await requireCoach();
  const { data: o } = await supabase.from("organizations").select("*").single();
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Organização" description={`Fuso horário: ${o?.timezone}`} />
      <Card>
        <ActionForm action={orgSettingsAction} submitLabel="Salvar configurações">
          <TextField name="name" label="Nome exibido" defaultValue={o?.name} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="invitation_ttl_hours" type="number" min={1} max={720} label="Validade do convite (horas)" defaultValue={o?.invitation_ttl_hours} />
            <TextField name="invoice_lead_days" type="number" min={0} max={28} label="Gerar cobrança quantos dias antes do vencimento" defaultValue={o?.invoice_lead_days} />
            <TextField name="default_travel_buffer_minutes" type="number" min={0} max={240} label="Deslocamento padrão entre locais (min)" defaultValue={o?.default_travel_buffer_minutes} />
            <TextField name="lesson_reminder_hours" type="number" min={1} max={72} label="Lembrete de aula (horas antes)" defaultValue={o?.lesson_reminder_hours} />
            <TextField name="due_soon_days" type="number" min={0} max={15} label="Aviso de vencimento (dias antes)" defaultValue={o?.due_soon_days} />
          </div>
          <TextAreaField name="contact_info" label="Orientações de contato (exibidas aos alunos)" defaultValue={o?.contact_info}
            hint="Ex.: horário de atendimento e canal preferido. Visível mesmo com acesso restrito." />
        </ActionForm>
      </Card>
    </>
  );
}
