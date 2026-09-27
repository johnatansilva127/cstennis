export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "evp";

export const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  evp: "Chave aleatória",
};

export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const calc = (weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + digits[i] * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === digits[12] && calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === digits[13];
}

/** Normaliza como o banco (a validação autoritativa está no servidor/SQL). */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  switch (type) {
    case "cpf":
      return isValidCpf(digits) ? digits : null;
    case "cnpj":
      return isValidCnpj(digits) ? digits : null;
    case "email":
      return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(v.toLowerCase()) && v.length <= 77 ? v.toLowerCase() : null;
    case "phone":
      if (/^55[1-9]\d{9,10}$/.test(digits)) return `+${digits}`;
      if (/^[1-9]\d{9,10}$/.test(digits)) return `+55${digits}`;
      return null;
    case "evp":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.toLowerCase()) ? v.toLowerCase() : null;
  }
}

/** Formatação amigável da chave exibida ao pagador. */
export function displayPixKey(type: PixKeyType, key: string): string {
  if (type === "cpf" && key.length === 11) return `${key.slice(0, 3)}.${key.slice(3, 6)}.${key.slice(6, 9)}-${key.slice(9)}`;
  if (type === "cnpj" && key.length === 14)
    return `${key.slice(0, 2)}.${key.slice(2, 5)}.${key.slice(5, 8)}/${key.slice(8, 12)}-${key.slice(12)}`;
  if (type === "phone" && key.startsWith("+55")) {
    const n = key.slice(3);
    return `+55 (${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
  }
  return key;
}
