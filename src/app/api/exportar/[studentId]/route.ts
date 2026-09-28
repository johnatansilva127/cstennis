import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

async function exportFor(supabase: SupabaseClient, studentId: string) {
  const { data, error } = await supabase.rpc("export_student_data", { p_student_id: studentId });
  if (error) {
    const status = error.code === "CS429" ? 429 : 404;
    return new NextResponse(error.code?.startsWith("CS") ? error.message : "Não foi possível exportar.", {
      status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cstennis-dados-${studentId.slice(0, 8)}.json"` },
  });
}

/** Exportação pelo aluno/responsável vinculado (dados que já pode ver). */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/exportar/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(studentId)) return new NextResponse("Não encontrado", { status: 404, headers: HEADERS });
  const supabase = await createSupabaseServerClient();
  return exportFor(supabase as unknown as SupabaseClient, studentId);
}

/** Exportação completa pelo professor (POST de formulário, com checagem de origem). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/exportar/[studentId]">) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse("Origem inválida", { status: 403, headers: HEADERS });
  const { studentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(studentId)) return new NextResponse("Não encontrado", { status: 404, headers: HEADERS });
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  return exportFor(supabase, studentId);
}
