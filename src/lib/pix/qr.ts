import "server-only";
import QRCode from "qrcode";
import { buildPixBrCode, isValidBrCode, type BrCodeInput } from "./brcode";

/** Gera payload + QR (PNG data URL). Retorna null se o payload não validar. */
export async function pixQr(input: BrCodeInput): Promise<{ payload: string; dataUrl: string } | null> {
  try {
    const payload = buildPixBrCode(input);
    if (!isValidBrCode(payload)) return null;
    const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 260 });
    return { payload, dataUrl };
  } catch {
    return null;
  }
}
