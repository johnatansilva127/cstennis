import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import net from "node:net";
import { clamdInstream } from "./scan";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function clamdAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: "127.0.0.1", port: 3310 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
  });
}

describe("antimalware (clamd)", () => {
  it("detecta EICAR e aprova arquivo limpo quando o clamd local está disponível", async (ctx) => {
    if (!(await clamdAvailable())) ctx.skip();
    expect(await clamdInstream("127.0.0.1", 3310, Buffer.from(EICAR))).toMatchObject({ status: "infected" });
    expect(await clamdInstream("127.0.0.1", 3310, Buffer.from("comprovante limpo"))).toMatchObject({ status: "clean" });
  });

  it("falha de conexão resulta em erro (arquivo continua em quarentena)", async () => {
    expect(await clamdInstream("127.0.0.1", 1, Buffer.from("x"), 2000)).toMatchObject({ status: "error" });
  });
});
