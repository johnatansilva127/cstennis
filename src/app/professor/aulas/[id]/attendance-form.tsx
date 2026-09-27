"use client";

import { ActionForm, Hidden, useFormCtx } from "@/components/ui/form";
import { saveAttendanceAction } from "../../agenda/actions";

const OPTIONS = [
  { value: "present", label: "Presente", cls: "has-[:checked]:bg-success-bg has-[:checked]:text-success has-[:checked]:border-success" },
  { value: "absent", label: "Falta", cls: "has-[:checked]:bg-danger-bg has-[:checked]:text-danger has-[:checked]:border-danger" },
  { value: "excused", label: "Justificada", cls: "has-[:checked]:bg-warning-bg has-[:checked]:text-warning has-[:checked]:border-warning" },
  { value: "", label: "Não informado", cls: "has-[:checked]:bg-neutral-bg has-[:checked]:border-border-strong" },
];

function Row({ student }: { student: { student_id: string; full_name: string; status: string | null } }) {
  const { state } = useFormCtx();
  const current = state.values?.[`status_${student.student_id}`] ?? student.status ?? "";
  return (
    <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 font-semibold">{student.full_name}</legend>
      <Hidden name="student_id" value={student.student_id} />
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong px-2 text-sm font-semibold ${o.cls}`}>
            <input type="radio" className="sr-only" name={`status_${student.student_id}`} value={o.value} defaultChecked={current === o.value} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AttendanceForm({ occurrenceId, roster }: { occurrenceId: string; roster: { student_id: string; full_name: string; status: string | null }[] }) {
  return (
    <ActionForm action={saveAttendanceAction.bind(null, occurrenceId)} submitLabel="Salvar chamada" pendingLabel="Salvando…">
      {roster.map((s) => <Row key={s.student_id} student={s} />)}
      <p className="text-xs text-muted">“Não informado” não vira falta. Salvar a chamada marca a aula como concluída.</p>
    </ActionForm>
  );
}
