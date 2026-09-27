"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";

export async function saveLocationAction(locationId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  if (str(fd, "name").length < 2) return { ok: false, fieldErrors: { name: "Informe o nome." }, values };
  return runRpc("coach", "save_location", {
    p_location_id: locationId,
    p_payload: { name: str(fd, "name"), address: opt(fd, "address"), instructions: opt(fd, "instructions"), active: locationId ? fd.get("active") === "on" : true },
  }, { values: locationId ? values : undefined, success: locationId ? "Local atualizado." : "Local criado." });
}

export async function saveCourtAction(courtId: string | null, locationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  if (!str(fd, "name")) return { ok: false, fieldErrors: { name: "Informe o nome da quadra." }, values };
  return runRpc("coach", "save_court", {
    p_court_id: courtId, p_location_id: locationId,
    p_payload: { name: str(fd, "name"), surface: opt(fd, "surface"), active: courtId ? fd.get("active") === "on" : true },
  }, { values: courtId ? values : undefined, success: courtId ? "Quadra atualizada." : "Quadra criada." });
}
