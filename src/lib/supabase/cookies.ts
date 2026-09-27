import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookies de sessão: HttpOnly (inacessíveis a JavaScript), SameSite=Lax e
 * Secure fora do ambiente local. O navegador nunca manipula tokens.
 */
export function sessionCookieOptions(): CookieOptions {
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  return { httpOnly: true, secure, sameSite: "lax", path: "/" };
}

export function hardenCookie(options: CookieOptions | undefined): CookieOptions {
  return { ...options, ...sessionCookieOptions() };
}
