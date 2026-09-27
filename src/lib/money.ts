/**
 * Dinheiro sempre em centavos inteiros. Nenhuma conversão passa por float.
 */
const MAX_CENTS = 10_000_000; // R$ 100.000,00

export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isInteger(cents)) throw new Error("Valor monetário deve estar em centavos inteiros.");
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${reais},${centavos}`;
}

/**
 * Converte entrada pt-BR ("1.250,50", "R$ 250", "250,5") em centavos.
 * Retorna null se inválida. Aceita também ponto decimal simples ("250.50").
 */
export function parseBRLToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    s = s.replace(".", ",");
  } else {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, "");
  }
  const m = s.match(/^(\d{1,9})(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

/** Valor para o campo 54 do BR Code: "123.45". */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("Valor inválido.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
