import { describe, expect, it } from "vitest";
import { displayPixKey, isValidCnpj, isValidCpf, normalizePixKey } from "./keys";

describe("chaves Pix", () => {
  it("valida CPF e CNPJ pelos dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
  });

  it("normaliza cada tipo de chave", () => {
    expect(normalizePixKey("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizePixKey("phone", "(11) 98888-7777")).toBe("+5511988887777");
    expect(normalizePixKey("phone", "123")).toBeNull();
    expect(normalizePixKey("email", "Professor@Example.test")).toBe("professor@example.test");
    expect(normalizePixKey("evp", "123E4567-E12B-12D1-A456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
    expect(displayPixKey("cpf", "52998224725")).toBe("529.982.247-25");
    expect(displayPixKey("phone", "+5511988887777")).toBe("+55 (11) 98888-7777");
  });
});
