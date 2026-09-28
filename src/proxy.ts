import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hardenCookie, sessionCookieOptions } from "@/lib/supabase/cookies";

const STUDENT_COOKIE = "cs-aluno";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const REACT_SEGMENT_STYLE_HASH = "sha256-aqNNdDLnnrDOnTNdkJpYlAxKVJtLt9CtFLklmInuUAE="; // "display:none"

function buildCsp(nonce: string, isDev: boolean) {
  const supabase = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // O streaming do React insere contêineres temporários com style="display:none"
    // (segmentos dentro de SVG). Liberamos somente esse atributo exato, por hash.
    `style-src 'self' 'nonce-${nonce}' 'unsafe-hashes' '${REACT_SEGMENT_STYLE_HASH}'`,
    `img-src 'self' data: blob: ${supabase}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    ...((process.env.APP_URL ?? "").startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, pathname: string, csp: string) {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  // Páginas com tokens na URL (convite, confirmação) não enviam referer.
  const noReferrer = pathname.startsWith("/convite") || pathname.startsWith("/auth/");
  res.headers.set("Referrer-Policy", noReferrer ? "no-referrer" : "strict-origin-when-cross-origin");
  // Nada autenticado/dinâmico é cacheado em CDN ou cache compartilhado.
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  if ((process.env.APP_URL ?? "").startsWith("https://")) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  // Seleção do aluno (contexto) vinda de links de aviso: grava em cookie e
  // limpa a URL. A validade do vínculo é sempre verificada no servidor.
  if (pathname.startsWith("/app") && searchParams.has("aluno")) {
    const value = searchParams.get("aluno") ?? "";
    const url = request.nextUrl.clone();
    url.searchParams.delete("aluno");
    const res = NextResponse.redirect(url, 303);
    if (UUID_RE.test(value)) {
      res.cookies.set(STUDENT_COOKIE, value, { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 180 });
    }
    return applySecurityHeaders(res, pathname, csp);
  }

  // Renova a sessão (tokens rotacionados) antes de renderizar.
  const pending: { name: string; value: string; options: Parameters<typeof hardenCookie>[0] }[] = [];
  const pendingHeaders: Record<string, string> = {};
  type Claims = { sub?: string };
  let claims: Claims | null = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const supabase = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const c of cookiesToSet) {
            request.cookies.set(c.name, c.value);
            pending.push(c);
          }
          Object.assign(pendingHeaders, headers);
        },
      },
    });
    try {
      const { data } = await supabase.auth.getClaims();
      claims = (data?.claims as Claims | undefined) ?? null;
    } catch {
      claims = null;
    }
  }

  const requiresAuth = pathname.startsWith("/professor") || pathname.startsWith("/app");
  let res: NextResponse;
  if (requiresAuth && !claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    url.searchParams.set("next", pathname);
    res = NextResponse.redirect(url);
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const c of pending) res.cookies.set(c.name, c.value, hardenCookie(c.options));
  for (const [k, v] of Object.entries(pendingHeaders)) res.headers.set(k, v);
  return applySecurityHeaders(res, pathname, csp);
}

export const config = {
  matcher: [
    // Inclui prefetches: a sessão precisa ser renovada também nessas requisições.
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|robots.txt|manifest.webmanifest).*)",
  ],
};
