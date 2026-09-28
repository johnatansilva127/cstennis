import { describe, expect, it } from "vitest";
import { createAdultStudent, processOutbox, rpc, rpcError, setupOrg, sql } from "../helpers/db";

function decode(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe("Professor só com senha (sem MFA, decisão D18)", () => {
  it("sessão aal1 acessa os dados da organização e troca o Pix, com auditoria e aviso", async () => {
    const org = await setupOrg();
    const { data: s } = await org.coach.client.auth.getSession();
    expect(decode(s.session!.access_token).aal).toBe("aal1");

    // Enxerga os próprios alunos pela RLS.
    const { student_id } = await createAdultStudent(org);
    const { data: students } = await org.coach.client.from("students").select("id");
    expect(students!.map((r) => r.id)).toContain(student_id);

    // Troca de Pix sem código do autenticador.
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
