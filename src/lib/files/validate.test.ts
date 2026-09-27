import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { detectType, extensionMatches, validateProof } from "./validate";

async function png(w = 20, h = 10) {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#008BC5" } }).png().toBuffer();
}
async function jpeg() {
  return sharp({ create: { width: 30, height: 30, channels: 3, background: "#FFD529" } }).jpeg().toBuffer();
}
function pdf(body: string) {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1");
}

describe("validação de comprovantes", () => {
  it("aceita PNG, JPEG e PDF simples pela assinatura real", async () => {
    const p = await validateProof(await png(), "comprovante.png");
    expect(p).toMatchObject({ ok: true, type: "png", mime: "image/png", width: 20, height: 10 });
    const j = await validateProof(await jpeg(), "foto.JPG");
    expect(j).toMatchObject({ ok: true, type: "jpeg" });
    const d = await validateProof(pdf("2 0 obj\n<< /Length 5 >>\nstream\nhello\nendstream\nendobj"), "recibo.pdf");
    expect(d).toMatchObject({ ok: true, type: "pdf", mime: "application/pdf" });
  });

  it("rejeita SVG, HTML, executável e tipos disfarçados", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await validateProof(svg, "x.png")).toMatchObject({ ok: false, code: "type" });
    expect(await validateProof(Buffer.from("<!doctype html><script>1</script>"), "x.pdf")).toMatchObject({ ok: false, code: "type" });
    expect(await validateProof(Buffer.from("MZ\x90\x00\x03", "latin1"), "x.jpg")).toMatchObject({ ok: false, code: "type" });
    expect(await validateProof(await png(), "comprovante.pdf")).toMatchObject({ ok: false, code: "extension" });
    expect(detectType(Buffer.from("GIF89a"))).toBeNull();
    expect(extensionMatches("arquivo.jpeg", "jpeg")).toBe(true);
  });

  it("rejeita arquivos corrompidos, vazios e grandes", async () => {
    const good = await png(200, 200);
    const truncated = good.subarray(0, Math.floor(good.length / 2));
    expect(await validateProof(truncated, "x.png")).toMatchObject({ ok: false, code: "corrupt" });
    expect(await validateProof(Buffer.alloc(0), "x.png")).toMatchObject({ ok: false, code: "empty" });
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10 * 1024 * 1024)]);
    expect(await validateProof(big, "x.jpg")).toMatchObject({ ok: false, code: "too_large" });
    expect(await validateProof(Buffer.from("%PDF-1.4\nsem fim"), "x.pdf")).toMatchObject({ ok: false, code: "pdf" });
  });

  it("rejeita PDF com JavaScript, inclusive dentro de stream comprimido", async () => {
    expect(await validateProof(pdf("<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"), "x.pdf"))
      .toMatchObject({ ok: false, code: "pdf" });
    const hidden = deflateSync(Buffer.from("<< /S /JavaScript /JS (app.alert(1)) >>"));
    const withStream = Buffer.concat([
      Buffer.from("%PDF-1.5\n3 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
      hidden,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    expect(await validateProof(withStream, "x.pdf")).toMatchObject({ ok: false, code: "pdf" });
    expect(await validateProof(pdf("<< /Encrypt 5 0 R >>"), "x.pdf")).toMatchObject({ ok: false, code: "pdf" });
  });
});
