"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import type { ActionState } from "@/lib/errors";
import { SeriesFields, type LocationOpt } from "../../series-fields";
import { previewSeriesAction } from "../../actions";

type Preview = {
  valid_effective_date: boolean; conflicts: string[]; student_conflicts: string[]; affected_students: { student_id: string; name: string }[];
  max_enrolled: number; new_capacity: number; capacity_ok: boolean; occurrences_to_regenerate: number; exceptions_preserved: number;
};

export function SeriesEditForm({ seriesId, locations, defaults, today, defaultBuffer }: {
  seriesId: string; locations: LocationOpt[]; today: string; defaultBuffer: number;
  defaults: Parameters<typeof SeriesFields>[0]["defaults"];
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const blocked = preview && (!preview.valid_effective_date || preview.conflicts.length > 0 || preview.student_conflicts.length > 0 || !preview.capacity_ok);
  return (
    <ActionForm action={previewSeriesAction.bind(null, seriesId)} hideSubmit
      onSuccess={(s: ActionState) => { if (s.data && !s.redirectTo) setPreview(s.data as Preview); }}>
      <SeriesFields locations={locations} defaults={defaults} defaultBuffer={defaultBuffer} />
      <TextField name="effective_date" type="date" label="Alteração vale a partir de" defaultValue={today} min={today} required
        hint="Aulas anteriores a esta data e registros de presença não são alterados." />
      {preview ? (
        <div aria-live="polite" className="space-y-2">
          <Alert tone={blocked ? "danger" : "info"} title="Impacto da alteração">
            <ul className="list-disc space-y-1 pl-5">
              <li>{preview.affected_students.length} aluno(s) matriculado(s) serão avisados{preview.affected_students.length ? `: ${preview.affected_students.map((s) => s.name).join(", ")}` : ""}.</li>
              <li>{preview.occurrences_to_regenerate} aula(s) futura(s) serão regeradas no novo formato.</li>
              <li>{preview.exceptions_preserved} exceção(ões) (canceladas/remarcadas individualmente) serão mantidas.</li>
              <li>Ocupação máxima no período: {preview.max_enrolled} de {preview.new_capacity} vaga(s){preview.capacity_ok ? "" : " — capacidade insuficiente"}.</li>
              {!preview.valid_effective_date ? <li>A data escolhida está fora da vigência ou no passado.</li> : null}
              {preview.conflicts.map((c) => <li key={c}>Conflito: {c}</li>)}
              {preview.student_conflicts.map((c) => <li key={c}>Conflito de aluno: {c}</li>)}
            </ul>
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="preview" variant="secondary" pendingLabel="Calculando…">Pré-visualizar impacto</SubmitButton>
        {preview && !blocked ? <SubmitButton name="intent" value="apply" pendingLabel="Aplicando…">Aplicar alteração</SubmitButton> : null}
      </div>
    </ActionForm>
  );
}
