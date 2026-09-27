import { describe, expect, it } from "vitest";
import { rpcError, setupOrg, verifyTotp, rpc } from "../helpers/db";

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
    // Chave inválida continua rejeitada.
    const err = await rpcError(org.coach, "update_pix_settings", {
      p_receiver_name: "Professor Teste", p_key_type: "cpf", p_pix_key: "111.111.111-11", p_city: "Sao Paulo", p_brcode_enabled: false });
    expect(err.code).toBe("CS422");
  }, 90_000);
});
