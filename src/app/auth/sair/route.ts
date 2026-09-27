import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STUDENT_COOKIE } from "@/lib/auth";

/**
 * Logout por POST (form nativo, navegação completa). Revoga a sessão no
 * Supabase Auth, apaga cookies e instrui o navegador a limpar cache e
 * armazenamento do site, evitando que dados da conta anterior reapareçam.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Origem inválida", { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.startsWith("sb-") || c.name === STUDENT_COOKIE) store.delete(c.name);
  }
  const res = NextResponse.redirect(new URL("/entrar", request.nextUrl.origin), 303);
  res.headers.set("Clear-Site-Data", '"cache", "storage"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}
