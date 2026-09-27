"use client";

import { useState } from "react";
import { SelectField, TextField, useFormCtx } from "@/components/ui/form";
import { weekdayLabel } from "@/lib/dates";

export type LocationOpt = { id: string; name: string; courts: { id: string; name: string }[] };

export function SeriesFields({ locations, defaults, defaultBuffer }: {
  locations: LocationOpt[];
  defaultBuffer: number;
  defaults?: Partial<{ weekday: number; start_time: string; duration_minutes: number; format: string; capacity: number;
    location_id: string; court_id: string | null; travel_buffer_minutes: number; level: string | null; title: string | null }>;
}) {
  const { state } = useFormCtx();
  const [format, setFormat] = useState(state.values?.format ?? defaults?.format ?? "group");
  const [loc, setLoc] = useState(state.values?.location_id ?? defaults?.location_id ?? locations[0]?.id ?? "");
  const courts = locations.find((l) => l.id === loc)?.courts ?? [];
  return (
    <div className="space-y-4">
      <TextField name="title" label="Nome (opcional)" defaultValue={defaults?.title} placeholder="Ex.: Turma intermediária" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="weekday" label="Dia da semana" required defaultValue={String(defaults?.weekday ?? 1)}
          options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: weekdayLabel(d) }))} />
        <TextField name="start_time" type="time" label="Início" required defaultValue={defaults?.start_time?.slice(0, 5) ?? "18:00"} />
        <TextField name="duration_minutes" type="number" min={15} max={300} step={5} label="Duração (min)" required defaultValue={defaults?.duration_minutes ?? 60} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="format" className="label-caps block text-muted">Formato <span aria-hidden className="text-danger">*</span></label>
          <select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base">
            <option value="individual">Individual (1 vaga)</option>
            <option value="double">Dupla (2 vagas)</option>
            <option value="group">Turma</option>
          </select>
        </div>
        {format === "group" ? (
          <TextField name="capacity" type="number" min={2} max={40} label="Capacidade da turma" required defaultValue={defaults?.capacity ?? 4} />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="location_id" className="label-caps block text-muted">Local <span aria-hidden className="text-danger">*</span></label>
          <select id="location_id" name="location_id" value={loc} onChange={(e) => setLoc(e.target.value)} required
            className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base">
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {state.fieldErrors?.location_id ? <p className="text-sm font-medium text-danger">{state.fieldErrors.location_id}</p> : null}
        </div>
        <SelectField key={loc} name="court_id" label="Quadra" defaultValue={defaults?.court_id ?? ""} placeholder="Sem quadra definida"
          options={courts.map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="travel_buffer_minutes" type="number" min={0} max={240} step={5} label="Deslocamento (min)"
          defaultValue={defaults?.travel_buffer_minutes ?? defaultBuffer}
          hint="Intervalo mínimo exigido entre esta aula e aulas em outro local. Não há cálculo por mapa." />
        <TextField name="level" label="Nível (opcional)" defaultValue={defaults?.level} placeholder="Ex.: iniciante" />
      </div>
    </div>
  );
}
