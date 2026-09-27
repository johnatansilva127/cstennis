import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatBRL, parseBRLToCents } from "./money";

describe("money", () => {
  it("formata BRL a partir de centavos", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(25000)).toBe("R$ 250,00");
    expect(formatBRL(125050)).toBe("R$ 1.250,50");
    expect(formatBRL(1000000000)).toBe("R$ 10.000.000,00");
    expect(() => formatBRL(1.5)).toThrow();
  });

  it("converte entradas pt-BR sem ponto flutuante", () => {
    expect(parseBRLToCents("250")).toBe(25000);
    expect(parseBRLToCents("250,5")).toBe(25050);
    expect(parseBRLToCents("R$ 1.250,50")).toBe(125050);
    expect(parseBRLToCents("1.250")).toBe(125000);
    expect(parseBRLToCents("250.50")).toBe(25050);
    expect(parseBRLToCents("0,10")).toBe(10);
    expect(parseBRLToCents("0,1")).toBe(10);
    // Clássico problema de float: 0,1 + 0,2 nunca aparece aqui.
    expect(parseBRLToCents("19,99")).toBe(1999);
    expect(parseBRLToCents("1,005")).toBeNull();
    expect(parseBRLToCents("-10")).toBeNull();
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("0")).toBeNull();
    expect(parseBRLToCents("100000,01")).toBeNull();
  });

  it("gera valor decimal para BR Code", () => {
    expect(centsToDecimalString(25000)).toBe("250.00");
    expect(centsToDecimalString(1)).toBe("0.01");
    expect(centsToDecimalString(123456)).toBe("1234.56");
  });
});
