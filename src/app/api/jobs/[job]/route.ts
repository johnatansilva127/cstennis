import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scanBuffer } from "@/lib/files/scan";

export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = env().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Limpeza e verificação de arquivos (não é possível pelo pg_cron: exige a API de storage). */
async function filesJob() {
  const admin = createSupabaseAdminClient();
  const out = { orphans: 0, infected_removed: 0, rescanned: 0, retention_removed: 0 };
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();

  const { data: orphans } = await admin.from("file_objects").select("id, bucket, object_path").eq("status", "pending_upload").lt("created_at", hourAgo).limit(200);
  for (const f of orphans ?? []) {
    await admin.storage.from(f.bucket).remove([f.object_path]);
    await admin.rpc("fail_payment_submission_upload", { p_file_id: f.id, p_reason: "orphan_cleanup" });
    out.orphans++;
  }

  const { data: infected } = await admin.from("file_objects").select("id, bucket, object_path").eq("status", "stored").eq("scan_status", "infected").limit(200);
  for (const f of infected ?? []) {
    const { error } = await admin.storage.from(f.bucket).remove([f.object_path]);
    if (!error) {
      await admin.rpc("mark_file_deleted", { p_file_id: f.id, p_reason: "infected" });
      out.infected_removed++;
    }
  }

  if (env().FILE_SCAN_PROVIDER === "clamav") {
    const { data: pending } = await admin.from("file_objects").select("id, bucket, object_path").eq("status", "stored").in("scan_status", ["pending", "error"]).limit(50);
    for (const f of pending ?? []) {
      const { data: blob } = await admin.storage.from(f.bucket).download(f.object_path);
      if (!blob) continue;
      const scan = await scanBuffer(Buffer.from(await blob.arrayBuffer()));
      if (scan.status === "clean" || scan.status === "infected") {
        await admin.rpc("set_file_scan_result", { p_file_id: f.id, p_scan_status: scan.status, p_scan_engine: scan.engine });
        out.rescanned++;
      }
    }
  }

  // Retenção configurável: remove o ARQUIVO de comprovantes de cobranças pagas há mais de N dias.
  const { data: orgs } = await admin.from("organizations").select("id, proof_retention_days").not("proof_retention_days", "is", null);
  for (const o of orgs ?? []) {
    const cutoff = new Date(Date.now() - (o.proof_retention_days as number) * 86400_000).toISOString();
    const { data: paid } = await admin.from("invoices").select("id").eq("organization_id", o.id).eq("status", "paid").lt("paid_at", cutoff).limit(500);
    const ids = (paid ?? []).map((i) => i.id);
    if (!ids.length) continue;
    const { data: subs } = await admin.from("payment_submissions").select("file_id, file_objects(id, bucket, object_path, status)").in("invoice_id", ids);
    for (const s of (subs ?? []) as unknown as { file_objects: { id: string; bucket: string; object_path: string; status: string } }[]) {
      if (s.file_objects?.status !== "stored") continue;
      const { error } = await admin.storage.from(s.file_objects.bucket).remove([s.file_objects.object_path]);
      if (!error) {
        await admin.rpc("mark_file_deleted", { p_file_id: s.file_objects.id, p_reason: "retention" });
        out.retention_removed++;
      }
    }
  }
  return out;
}

async function handle(request: NextRequest, job: string) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    if (job === "files") return NextResponse.json({ ok: true, result: await filesJob() });
    if (job === "daily" || job === "frequent") {
      const { data, error } = await createSupabaseAdminClient().rpc("run_jobs_now", { p_job: job });
      if (error) return NextResponse.json({ ok: false }, { status: 500 });
      return NextResponse.json({ ok: true, result: data });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch {
    console.error(JSON.stringify({ level: "error", scope: "jobs", job }));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Vercel Cron chama por GET com "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest, ctx: RouteContext<"/api/jobs/[job]">) {
  return handle(request, (await ctx.params).job);
}
export async function POST(request: NextRequest, ctx: RouteContext<"/api/jobs/[job]">) {
  return handle(request, (await ctx.params).job);
}
