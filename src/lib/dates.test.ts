import { describe, expect, it } from "vitest";
import { addDays, addMonths, endOfMonth, isValidDate, isoWeekday, relativeDays, startOfWeek, todayInTz } from "./dates";

describe("dates", () => {
  it("data local em America/Sao_Paulo vira à meia-noite local, não UTC", () => {
    expect(todayInTz("America/Sao_Paulo", new Date("2026-10-01T02:59:00Z"))).toBe("2026-09-30");
    expect(todayInTz("America/Sao_Paulo", new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01");
    expect(todayInTz("America/Sao_Paulo", new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });

  it("aritmética de datas civis", () => {
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(endOfMonth("2027-02-10")).toBe("2027-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-04-05")).toBe("2026-04-30");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2027-01-31", -1)).toBe("2026-12-01");
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-09-27")).toBe(7);
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28");
    expect(relativeDays("2026-10-02", "2026-10-01")).toBe("amanhã");
  });

  it("valida datas reais", () => {
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("01/02/2026")).toBe(false);
  });
});

import { isoToZonedLocal, zonedLocalToIso } from "./dates";
describe("conversão de horário local", () => {
  it("America/Sao_Paulo (UTC-3)", () => {
    expect(zonedLocalToIso("2026-10-05T18:00")).toBe("2026-10-05T21:00:00.000Z");
    expect(zonedLocalToIso("2026-12-31T23:30")).toBe("2027-01-01T02:30:00.000Z");
    expect(isoToZonedLocal("2027-01-01T02:30:00.000Z")).toBe("2026-12-31T23:30");
    expect(zonedLocalToIso("inválido")).toBeNull();
  });
});
