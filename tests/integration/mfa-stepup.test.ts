import { describe, expect, it } from "vitest";
import { processOutbox, rpcError, setupOrg, sql, verifyTotp, rpc } from "../helpers/db";

function decode(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe("Step-up de MFA", () => {
  it("nova verificação TOTP renova o carimbo amr usado nas ações sensíveis", async () => {
    const org = await setupOrg();
    const { data: s1 } = await org.coach.client.auth.getSession();
    const amr1 = decode(s1.session!.access_token).amr.find((a: { method: string }) => a.method === "totp");
    expect(decode(s1.session!.access_token).aal).toBe("aal2");
    await verifyTotp(org.coach);
    const { data: s2 } = await org.coach.client.auth.getSession();
    const amr2 = decode(s2.session!.access_token).amr.find((a: { method: string }) => a.method === "totp");
    expect(amr2.timestamp).toBeGreaterThanOrEqual(amr1.timestamp);
    // Ação sensível passa com MFA recente.
    await rpc(org.coach, "update_pix_settings", {
      p_receiver_name: "Professor Teste", p_key_type: "email", p_pix_key: "professor@example.test", p_city: "Sao Paulo", p_brcode_enabled: false });
    // Troca de Pix é auditada e avisada ao professor sem registrar a chave (nem parcialmente).
    await rpc(org.coach, "update_pix_settings", {
      p_receiver_name: "Professor Teste", p_key_type: "email", p_pix_key: "outra-chave@example.test", p_city: "Sao Paulo", p_brcode_enabled: false });
    const audits = await sql<{ diff: unknown }>(
      "select diff from public.audit_events where organization_id = $1 and action = 'pix.update' order by created_at", [org.orgId]);
    expect(audits).toHaveLength(2);
    expect(audits[1].diff).toMatchObject({ key_changed: true, after: { key_type: "email" } });
    await processOutbox();
    const notes = await sql<{ title: string; body: string }>(
      "select title, body from public.notifications where organization_id = $1 and title = 'Dados Pix alterados'", [org.orgId]);
    expect(notes.length).toBeGreaterThan(0);
    const logged = JSON.stringify({ audits, notes });
    for (const fragment of ["professor@", "outra-chave", "example.test"]) expect(logged).not.toContain(fragment);
    // Chave inválida continua rejeitada.
    const err = await rpcError(org.coach, "update_pix_settings", {
      p_receiver_name: "Professor Teste", p_key_type: "cpf", p_pix_key: "111.111.111-11", p_city: "Sao Paulo", p_brcode_enabled: false });
    expect(err.code).toBe("CS422");
  }, 90_000);
});
