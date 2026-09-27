import "server-only";
import net from "node:net";
import { env } from "@/lib/env";

export type ScanResult = { status: "clean" | "infected" | "error" | "pending"; engine: string; signature?: string };

/**
 * Verificação antimalware via clamd (protocolo INSTREAM). Sem provedor
 * configurado, o arquivo permanece em quarentena ("pending") — nunca é
 * marcado como verificado.
 */
export async function scanBuffer(bytes: Buffer): Promise<ScanResult> {
  const e = env();
  if (e.FILE_SCAN_PROVIDER !== "clamav" || !e.CLAMAV_HOST) {
    return { status: "pending", engine: "none" };
  }
  return clamdInstream(e.CLAMAV_HOST, e.CLAMAV_PORT ?? 3310, bytes);
}

export function clamdInstream(host: string, port: number, bytes: Buffer, timeoutMs = 20000): Promise<ScanResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    const done = (r: ScanResult) => {
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeoutMs, () => done({ status: "error", engine: "clamav" }));
    socket.on("error", () => done({ status: "error", engine: "clamav" }));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const chunk = 64 * 1024;
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.subarray(i, i + chunk);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (data) => {
      response += data.toString("utf8");
      if (response.includes("\0")) {
        const text = response.replace(/\0/g, "").trim();
        if (/: OK$/.test(text)) done({ status: "clean", engine: "clamav" });
        else if (/FOUND$/.test(text)) done({ status: "infected", engine: "clamav", signature: text.replace(/^stream: /, "").replace(/ FOUND$/, "") });
        else done({ status: "error", engine: "clamav" });
      }
    });
  });
}
