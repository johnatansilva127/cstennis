/** Aceita apenas caminhos internos conhecidos (evita open redirect). */
export function safeNext(next: string | undefined | null, fallback: string) {
  if (!next || !/^\/(professor|app)(\/[A-Za-z0-9/_\-]*)?$/.test(next)) return fallback;
  return next;
}
