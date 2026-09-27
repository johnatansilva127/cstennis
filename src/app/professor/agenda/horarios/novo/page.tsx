import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ActionForm, TextField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { SeriesFields } from "../../series-fields";
import { createSeriesAction } from "../../actions";

export const metadata: Metadata = { title: "Novo horário" };

export default async function NewSeriesPage() {
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const [{ data: locations }, { data: orgRow }] = await Promise.all([
    supabase.from("locations").select("id, name, courts(id, name, active)").eq("active", true).order("name"),
    supabase.from("organizations").select("default_travel_buffer_minutes").single(),
  ]);
  const opts = (locations ?? []).map((l) => ({ id: l.id, name: l.name, courts: (l.courts ?? []).filter((c) => c.active) }));
  return (
    <>
      <PageHeader back={{ href: "/professor/agenda/horarios", label: "Horários fixos" }} title="Novo horário fixo"
        description="Conflitos de professor, quadra e deslocamento são verificados ao salvar." />
      {opts.length === 0 ? (
        <EmptyState title="Cadastre um local primeiro" action={<ButtonLink href="/professor/locais">Ir para locais</ButtonLink>} />
      ) : (
        <ActionForm action={createSeriesAction} submitLabel="Criar horário" pendingLabel="Criando…">
          <Card>
            <SeriesFields locations={opts} defaultBuffer={orgRow?.default_travel_buffer_minutes ?? 30} />
          </Card>
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="valid_from" type="date" label="Vigência a partir de" defaultValue={today} min={today} required />
              <TextField name="valid_until" type="date" label="Até (opcional)" min={today} />
            </div>
          </Card>
        </ActionForm>
      )}
    </>
  );
}
