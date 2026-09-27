import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SeriesOption = {
  id: string; series_root_id: string; title: string | null; weekday: number; start_time: string; duration_minutes: number;
  format: "individual" | "double" | "group"; capacity: number; level: string | null; valid_from: string; valid_until: string | null;
  location_name: string; location_id: string; court_name: string | null; occupied: number;
};

/** Versões vigentes (ou a primeira futura) de cada série, com ocupação atual. */
export async function currentSeries(supabase: SupabaseClient<Database>, today: string): Promise<SeriesOption[]> {
  const { data: rows } = await supabase
    .from("recurring_slots")
    .select("id, series_root_id, title, weekday, start_time, duration_minutes, format, capacity, level, valid_from, valid_until, location_id, locations(name), courts(name)")
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("weekday")
    .order("start_time");
  const { data: enr } = await supabase
    .from("enrollments")
    .select("series_id, valid_from, valid_until")
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gte.${today}`);
  const byRoot = new Map<string, SeriesOption>();
  for (const r of (rows ?? []) as unknown as (SeriesOption & { locations: { name: string } | null; courts: { name: string } | null })[]) {
    const prev = byRoot.get(r.series_root_id);
    if (prev && prev.valid_from <= r.valid_from) continue;
    const ref = r.valid_from > today ? r.valid_from : today;
    const occupied = (enr ?? []).filter((e) => e.series_id === r.id && e.valid_from <= ref && (!e.valid_until || e.valid_until >= ref)).length;
    byRoot.set(r.series_root_id, {
      ...r, location_name: r.locations?.name ?? "", court_name: r.courts?.name ?? null, occupied,
    });
  }
  return [...byRoot.values()].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}
