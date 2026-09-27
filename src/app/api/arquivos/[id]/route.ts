import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

/**
 * Download autorizado de comprovante: verifica o vínculo (RPC com a sessão do
 * usuário) e só então emite uma URL assinada de 60 segundos, servida pelo
 * domínio do storage (isolado do app). PDFs vão sempre como anexo.
 */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/arquivos/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Não encontrado", { status: 404, headers: NO_STORE });
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Sessão expirada", { status: 401, headers: NO_STORE });
  const { data, error } = await supabase.rpc("authorize_file_download", { p_file_id: id });
  if (error) return new NextResponse("Não encontrado", { status: error.code === "CS429" ? 429 : 404, headers: NO_STORE });
  const auth = data as { allowed: boolean; reason?: string; bucket?: string; object_path?: string; detected_type?: string };
  if (!auth.allowed || !auth.bucket || !auth.object_path) {
    return new NextResponse(
      auth.reason === "pending" ? "Arquivo em quarentena aguardando verificação antimalware." : "Arquivo indisponível.",
      { status: 409, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signErr } = await admin.storage.from(auth.bucket).createSignedUrl(auth.object_path, 60, {
    download: auth.detected_type === "pdf" ? "comprovante.pdf" : false,
  });
  if (signErr || !signed) return new NextResponse("Arquivo indisponível.", { status: 404, headers: NO_STORE });
  return NextResponse.redirect(signed.signedUrl, { status: 303, headers: NO_STORE });
}
