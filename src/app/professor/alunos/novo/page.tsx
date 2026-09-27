import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { env } from "@/lib/env";
import { currentSeries } from "@/lib/data/series";
import { todayInTz, weekdayLabel, formatTime } from "@/lib/dates";
import { FORMAT_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { NewStudentForm } from "./new-student-form";

export const metadata: Metadata = { title: "Novo aluno" };

export default async function NewStudentPage() {
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const [series, guardians] = await Promise.all([
    currentSeries(supabase, today),
    supabase.from("guardians").select("id, full_name, email").eq("status", "active").order("full_name"),
  ]);
  return (
    <>
      <PageHeader title="Novo aluno" back={{ href: "/professor/alunos", label: "Alunos" }}
        description="Cadastro mínimo: nome, tipo e contato. CPF e endereço não são necessários." />
      <NewStudentForm
        appUrl={env().APP_URL}
        today={today}
        defaultMonth={today.slice(0, 7)}
        guardians={(guardians.data ?? []).map((g) => ({ id: g.id, label: `${g.full_name}${g.email ? ` (${g.email})` : ""}` }))}
        series={series.map((s) => ({
          id: s.id,
          full: s.occupied >= s.capacity,
          label: `${weekdayLabel(s.weekday)} ${formatTime(s.start_time)} · ${s.title ?? FORMAT_LABEL[s.format]} · ${s.location_name} · ${s.occupied}/${s.capacity}`,
        }))}
      />
    </>
  );
}
