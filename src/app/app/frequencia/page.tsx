import type { Metadata } from "next";
import Link from "next/link";
import { participantContext } from "@/lib/participant";
import { addDays, todayInTz } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Stat } from "@/components/ui/card";
import { RestrictedNotice } from "@/components/restricted";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Frequência" };

const PERIODS = [{ d: 30, label: "30 dias" }, { d: 90, label: "3 meses" }, { d: 365, label: "12 meses" }];

export default async function AttendancePage({ searchParams }: PageProps<"/app/frequencia">) {
  const sp = await searchParams;
  const { supabase, student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Frequência" /><RestrictedNotice who={who} /></>;
  const days = PERIODS.some((p) => String(p.d) === sp.periodo) ? Number(sp.periodo) : 90;
  const today = todayInTz(tz);
  const { data } = await supabase.rpc("attendance_summary", { p_student_id: student.id, p_from: addDays(today, -days), p_to: today });
  const s = data as { present: number; absent: number; excused: number; not_recorded: number; marked: number; rate: number | null } | null;
  return (
    <>
      <PageHeader title="Frequência" description={who !== "você" ? student.full_name : undefined} />
      <nav aria-label="Período" className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
        {PERIODS.map((p) => (
          <Link key={p.d} href={`/app/frequencia?periodo=${p.d}`} aria-current={days === p.d ? "page" : undefined}
            className={cn("inline-flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold", days === p.d ? "bg-surface shadow-sm" : "text-muted")}>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Frequência" value={s?.rate === null || s?.rate === undefined ? "—" : `${s.rate.toLocaleString("pt-BR")}%`} hint={`${s?.marked ?? 0} marcações`} />
        <Stat label="Presenças" value={s?.present ?? 0} tone="success" />
        <Stat label="Faltas" value={s?.absent ?? 0} tone="danger" />
        <Stat label="Justificadas" value={s?.excused ?? 0} tone="warning" />
        <Stat label="Não informadas" value={s?.not_recorded ?? 0} />
      </div>
      <Card className="mt-5">
        <h2 className="font-display font-bold">Como calculamos</h2>
        <p className="mt-1 text-sm text-muted">
          Frequência = presenças ÷ (presenças + faltas + faltas justificadas), somente em aulas já realizadas. Aulas canceladas e
          futuras não entram no cálculo. Aulas realizadas sem registro do professor aparecem como “não informadas” e também ficam
          fora da conta. Veja cada aula em <Link href="/app/aulas" className="font-semibold text-link">Aulas</Link>.
        </p>
      </Card>
    </>
  );
}
