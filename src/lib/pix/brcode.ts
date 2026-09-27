import { centsToDecimalString } from "@/lib/money";

/**
 * Payload estático "Pix Copia e Cola" (BR Code, padrão EMV® MPM do Banco
 * Central). Gerado apenas quando o professor habilita a opção; a chave Pix
 * sozinha nunca é apresentada como payload.
 */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  const len = Buffer.byteLength(value, "utf8");
  if (len > 99) throw new Error(`Campo ${id} excede 99 caracteres.`);
  return `${id}${String(len).padStart(2, "0")}${value}`;
}

/** Remove acentos e caracteres fora do conjunto permitido. */
export function sanitizeMerchantText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, max);
}

export type BrCodeInput = {
  pixKey: string;
  receiverName: string;
  city: string;
  amountCents?: number;
  txid?: string;
};

export function buildPixBrCode({ pixKey, receiverName, city, amountCents, txid }: BrCodeInput): string {
  const name = sanitizeMerchantText(receiverName, 25);
  const cityName = sanitizeMerchantText(city, 15);
  if (!pixKey || !name || !cityName) throw new Error("Dados Pix incompletos.");
  const reference = txid && /^[A-Za-z0-9]{1,25}$/.test(txid) ? txid : "***";
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", pixKey);
  let payload =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amountCents ? tlv("54", centsToDecimalString(amountCents)) : "") +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", cityName) +
    tlv("62", tlv("05", reference));
  payload += "6304";
  return payload + crc16ccitt(payload);
}

/** Valida um payload (estrutura TLV + CRC). Usado nos testes e antes de exibir. */
export function isValidBrCode(payload: string): boolean {
  if (!/^000201/.test(payload) || payload.length < 30) return false;
  const body = payload.slice(0, -4);
  if (!body.endsWith("6304")) return false;
  if (crc16ccitt(body) !== payload.slice(-4)) return false;
  let i = 0;
  while (i < body.length - 4) {
    const len = Number(body.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) return false;
    i += 4 + len;
  }
  return i === body.length - 4;
}
