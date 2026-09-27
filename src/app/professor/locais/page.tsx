import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/states";
import { ActionForm, CheckboxField, TextAreaField, TextField } from "@/components/ui/form";
import { saveCourtAction, saveLocationAction } from "./actions";

export const metadata: Metadata = { title: "Locais e quadras" };

export default async function LocationsPage() {
  const { supabase } = await requireCoach();
  const { data } = await supabase.from("locations").select("*, courts(*)").order("name");
  return (
    <>
      <PageHeader title="Locais e quadras" description="Desativar um local não apaga aulas passadas; ele deixa de aparecer para novos horários." />
      <div className="space-y-4">
        {(data ?? []).length === 0 ? <EmptyState title="Nenhum local cadastrado" description="Cadastre onde as aulas acontecem." /> : null}
        {(data ?? []).map((l) => (
          <Card key={l.id}>
            <CardHeader title={l.name} description={l.address ?? undefined}
              action={<StatusBadge tone={l.active ? "success" : "neutral"}>{l.active ? "Ativo" : "Inativo"}</StatusBadge>} />
            {l.instructions ? <p className="mb-3 text-sm text-muted">{l.instructions}</p> : null}
            <ul className="mb-3 flex flex-wrap gap-2">
              {(l.courts ?? []).map((c) => (
                <li key={c.id}><StatusBadge tone={c.active ? "info" : "neutral"}>{c.name}{c.surface ? ` · ${c.surface}` : ""}{c.active ? "" : " (inativa)"}</StatusBadge></li>
              ))}
            </ul>
            <div className="space-y-2">
              <Disclosure summary="Editar local">
                <ActionForm action={saveLocationAction.bind(null, l.id)} submitLabel="Salvar local">
                  <TextField name="name" label="Nome" defaultValue={l.name} required />
                  <TextField name="address" label="Endereço da aula" defaultValue={l.address} />
                  <TextAreaField name="instructions" label="Orientações (ex.: portaria, estacionamento)" defaultValue={l.instructions} />
                  <CheckboxField name="active" label="Local ativo" defaultChecked={l.active} />
                </ActionForm>
              </Disclosure>
              <Disclosure summary="Adicionar quadra">
                <ActionForm action={saveCourtAction.bind(null, null, l.id)} submitLabel="Adicionar quadra" resetOnSuccess>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="name" label="Nome" required placeholder="Quadra 1" />
                    <TextField name="surface" label="Piso (opcional)" placeholder="Saibro, rápida…" />
                  </div>
                </ActionForm>
              </Disclosure>
              {(l.courts ?? []).map((c) => (
                <Disclosure key={c.id} summary={`Editar ${c.name}`}>
                  <ActionForm action={saveCourtAction.bind(null, c.id, l.id)} submitLabel="Salvar quadra">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField name="name" label="Nome" defaultValue={c.name} required />
                      <TextField name="surface" label="Piso" defaultValue={c.surface} />
                    </div>
                    <CheckboxField name="active" label="Quadra ativa" defaultChecked={c.active} />
                  </ActionForm>
                </Disclosure>
              ))}
            </div>
          </Card>
        ))}
        <Card>
          <CardHeader title="Novo local" />
          <ActionForm action={saveLocationAction.bind(null, null)} submitLabel="Criar local" resetOnSuccess>
            <TextField name="name" label="Nome" required placeholder="Ex.: Clube Central" />
            <TextField name="address" label="Endereço da aula" />
            <TextAreaField name="instructions" label="Orientações (opcional)" />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
