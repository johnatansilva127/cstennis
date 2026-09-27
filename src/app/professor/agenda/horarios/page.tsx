import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { currentSeries } from "@/lib/data/series";
import { endTime, formatDate, formatTime, todayInTz, weekdayLabel } from "@/lib/dates";
import { FORMAT_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status";

export const metadata: Metadata = { title: "Horários fixos" };

export default async function SeriesListPage() {
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const series = await currentSeries(supabase, today);
  return (
    <>
      <PageHeader back={{ href: "/professor/agenda", label: "Agenda" }} title="Horários fixos"
        description="Séries semanais recorrentes. As aulas concretas são geradas automaticamente para os próximos 90 dias."
        actions={<ButtonLink href="/professor/agenda/horarios/novo"><Plus aria-hidden className="size-4" /> Novo horário</ButtonLink>} />
      {series.length === 0 ? <EmptyState title="Nenhum horário cadastrado" action={<ButtonLink href="/professor/agenda/horarios/novo">Criar horário</ButtonLink>} /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {series.map((s) => (
            <li key={s.id}>
              <Link href={`/professor/agenda/horarios/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="w-24 shrink-0">
                  <span className="block text-xs font-semibold uppercase text-muted">{weekdayLabel(s.weekday, true)}</span>
                  <span className="block font-display text-lg font-bold">{formatTime(s.start_time)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.title ?? FORMAT_LABEL[s.format]} · até {endTime(s.start_time, s.duration_minutes)}</span>
                  <span className="block truncate text-sm text-muted">{s.location_name}{s.court_name ? ` · ${s.court_name}` : ""}{s.level ? ` · ${s.level}` : ""}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <StatusBadge tone={s.occupied >= s.capacity ? "warning" : "success"}>{s.occupied}/{s.capacity} vagas ocupadas</StatusBadge>
                    {s.valid_from > today ? <StatusBadge tone="info">Começa em {formatDate(s.valid_from)}</StatusBadge> : null}
                    {s.valid_until ? <StatusBadge tone="neutral">Até {formatDate(s.valid_until)}</StatusBadge> : null}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
