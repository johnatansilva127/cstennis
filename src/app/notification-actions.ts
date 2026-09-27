"use server";

import { runRpc } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";

export async function markAllReadAction(_: ActionState): Promise<ActionState> {
  return runRpc("any", "mark_notifications_read", { p_ids: null }, { success: "Avisos marcados como lidos." });
}
