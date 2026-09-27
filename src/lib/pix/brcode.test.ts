import { describe, expect, it } from "vitest";
import { buildPixBrCode, crc16ccitt, isValidBrCode } from "./brcode";

describe("BR Code Pix", () => {
  it("CRC16-CCITT (FALSE) confere com o vetor padrão", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });

  it("reproduz exatamente o exemplo estático do Manual do BR Code (BCB)", () => {
    const payload = buildPixBrCode({
      pixKey: "123e4567-e12b-12d1-a456-426655440000",
      receiverName: "Fulano de Tal",
      city: "BRASILIA",
    });
    expect(payload).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
    expect(isValidBrCode(payload)).toBe(true);
  });

  it("inclui valor, remove acentos e mantém limites de campo", () => {
    const payload = buildPixBrCode({
      pixKey: "professor@example.test",
      receiverName: "José da Conceição Tênis Ltda Nome Muito Longo",
      city: "São Paulo",
      amountCents: 25050,
    });
    expect(payload).toContain("5406250.50");
    expect(payload).toContain("5925Jose da Conceicao Tenis L");
    expect(payload).toContain("6009Sao Paulo");
    expect(isValidBrCode(payload)).toBe(true);
    expect(isValidBrCode(payload.slice(0, -1) + "0")).toBe(false);
  });
});
