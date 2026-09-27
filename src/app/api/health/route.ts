import { NextResponse } from "next/server";

/** Verificação de disponibilidade para monitoramento externo (sem dados). */
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
