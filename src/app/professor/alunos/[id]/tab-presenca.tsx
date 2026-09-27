import { Card, CardHeader, Stat } from "@/components/ui/card";
import { addDays } from "@/lib/dates";
import type { TabProps } from "./types";

export async function TabPresenca({ studentId, supabase, today }: TabProps) {
  const periods = [30, 90, 365];
  const results = await Promise.all(periods.map((d) =>
    supabase.rpc("attendance_summary", { p_student_id: studentId, p_from: addDays(today, -d), p_to: today })));
  return (
    <div className="space-y-5">
      {periods.map((d, idx) => {
        const s = results[idx].data as { present: number; absent: number; excused: number; not_recorded: number; marked: number; rate: number | null } | null;
        return (
          <Card key={d}>
            <CardHeader title={`Últimos ${d} dias`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Frequência" value={s?.rate === null || s?.rate === undefined ? "—" : `${s.rate.toLocaleString("pt-BR")}%`} />
              <Stat label="Presenças" value={s?.present ?? 0} tone="success" />
              <Stat label="Faltas" value={s?.absent ?? 0} tone="danger" />
              <Stat label="Justificadas" value={s?.excused ?? 0} tone="warning" />
              <Stat label="Não informadas" value={s?.not_recorded ?? 0} />
            </div>
          </Card>
        );
      })}
      <p className="text-sm text-muted">
        Frequência = presenças ÷ (presenças + faltas + faltas justificadas) em aulas concluídas. Aulas canceladas e futuras não
        entram no cálculo; aulas concluídas sem marcação aparecem como “não informadas” e também ficam fora do cálculo.
      </p>
    </div>
  );
}
