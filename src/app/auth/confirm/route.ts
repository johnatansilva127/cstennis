import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Confirmação de links de e-mail (recuperação de senha). Token de uso único
 * validado pelo Supabase Auth; o redirecionamento é fixo (sem open redirect).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const fail = NextResponse.redirect(new URL("/recuperar-senha?erro=link", url.origin), 303);
  if (!tokenHash || type !== "recovery" || tokenHash.length > 200) return fail;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error) return fail;
  const res = NextResponse.redirect(new URL("/redefinir-senha", url.origin), 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
