import { describe, expect, it, beforeAll } from "vitest";
import {
  admin, anonClient, createUser, rpc, rpcError, setupOrg, signIn, sql, uniqueEmail, type Org,
} from "../helpers/db";

describe("Convites (critérios 1 e 2)", () => {
  let org: Org;
  beforeAll(async () => {
    org = await setupOrg();
  });

  it("professor cadastra aluno, matricula e gera convite; aceite ocorre uma única vez", async () => {
    const email = uniqueEmail("convite");
    const created = await rpc<{ student_id: string; invitation: { token: string; invitation_id: string; expires_at: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Aluna Convite", kind: "adult", email, invite: true } });
    expect(created.invitation.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Somente o hash é armazenado.
    const stored = await sql<{ hex: string }>(
      "select encode(token_hash, 'hex') as hex from private.invitation_tokens where invitation_id = $1", [created.invitation.invitation_id]);
    expect(stored[0].hex).toHaveLength(64);
    expect(stored[0].hex).not.toContain(created.invitation.token);

    // Validade padrão de 48 horas.
    const hours = (new Date(created.invitation.expires_at).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);

    const preview = await rpc<{ status: string; masked_email: string }>(admin, "invitation_preview", { p_token: created.invitation.token });
    expect(preview.status).toBe("valid");
    expect(preview.masked_email).not.toBe(email);

    await createUser(email);
    const s = await signIn(email);
    const first = await rpc<{ ok: boolean; code: string }>(s, "accept_invitation", { p_token: created.invitation.token });
    expect(first).toMatchObject({ ok: true, code: "accepted" });

    // Segunda aceitação: idempotente para o mesmo usuário, nunca cria segundo vínculo.
    const second = await rpc<{ ok: boolean; code: string }>(s, "accept_invitation", { p_token: created.invitation.token });
    expect(second.code).toBe("already_accepted");
    const links = await sql("select * from public.student_user_links where student_id = $1", [created.student_id]);
    expect(links).toHaveLength(1);

    // O aluno enxerga o próprio cadastro.
    const { data } = await s.client.from("students").select("id, full_name");
    expect(data).toEqual([{ id: created.student_id, full_name: "Aluna Convite" }]);
  });

  it("convite expirado é recusado", async () => {
    const email = uniqueEmail("expira");
    const created = await rpc<{ invitation: { token: string; invitation_id: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Expira", kind: "adult", email, invite: true } });
    await sql("update public.invitations set expires_at = now() - interval '1 minute' where id = $1", [created.invitation.invitation_id]);
    await createUser(email);
    const s = await signIn(email);
    const res = await rpc<{ ok: boolean; code: string }>(s, "accept_invitation", { p_token: created.invitation.token });
    expect(res).toEqual({ ok: false, code: "expired" });
    const preview = await rpc<{ status: string }>(admin, "invitation_preview", { p_token: created.invitation.token });
    expect(preview.status).toBe("expired");
  });

  it("convite revogado é recusado e novo convite revoga o anterior", async () => {
    const email = uniqueEmail("revoga");
    const created = await rpc<{ student_id: string; invitation: { token: string; invitation_id: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Revoga", kind: "adult", email, invite: true } });
    const again = await rpc<{ token: string; invitation_id: string }>(org.coach, "create_invitation", {
      p_kind: "student", p_target_id: created.student_id, p_email: null });
    const old = await sql<{ status: string }>("select status from public.invitations where id = $1", [created.invitation.invitation_id]);
    expect(old[0].status).toBe("revoked");

    await rpc(org.coach, "revoke_invitation", { p_invitation_id: again.invitation_id });
    await createUser(email);
    const s = await signIn(email);
    expect((await rpc<{ code: string }>(s, "accept_invitation", { p_token: created.invitation.token })).code).toBe("revoked");
    expect((await rpc<{ code: string }>(s, "accept_invitation", { p_token: again.token })).code).toBe("revoked");
  });

  it("destinatário incorreto é recusado, tentativa é contada e o convite bloqueia após 5 falhas", async () => {
    const email = uniqueEmail("certo");
    const created = await rpc<{ invitation: { token: string; invitation_id: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Certo", kind: "adult", email, invite: true } });
    const intruderEmail = uniqueEmail("intruso");
    await createUser(intruderEmail);
    const intruder = await signIn(intruderEmail);
    for (let i = 0; i < 5; i++) {
      const res = await rpc<{ ok: boolean; code: string }>(intruder, "accept_invitation", { p_token: created.invitation.token });
      expect(res).toEqual({ ok: false, code: "wrong_recipient" });
    }
    const locked = await rpc<{ code: string }>(intruder, "accept_invitation", { p_token: created.invitation.token });
    expect(locked.code).toBe("locked");
    // Nem o destinatário correto consegue usar um convite bloqueado.
    await createUser(email);
    const right = await signIn(email);
    expect((await rpc<{ code: string }>(right, "accept_invitation", { p_token: created.invitation.token })).code).toBe("locked");
    const { data } = await intruder.client.from("students").select("id");
    expect(data).toEqual([]);
  });

  it("aceitação concorrente produz um único vínculo", async () => {
    const email = uniqueEmail("concorrente");
    const created = await rpc<{ student_id: string; invitation: { token: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Concorrente", kind: "adult", email, invite: true } });
    await createUser(email);
    const a = await signIn(email);
    const b = await signIn(email);
    const results = await Promise.all([
      rpc<{ ok: boolean; code: string }>(a, "accept_invitation", { p_token: created.invitation.token }),
      rpc<{ ok: boolean; code: string }>(b, "accept_invitation", { p_token: created.invitation.token }),
      rpc<{ ok: boolean; code: string }>(a, "accept_invitation", { p_token: created.invitation.token }),
    ]);
    expect(results.filter((r) => r.code === "accepted")).toHaveLength(1);
    expect(results.every((r) => r.ok)).toBe(true);
    const links = await sql("select * from public.student_user_links where student_id = $1", [created.student_id]);
    expect(links).toHaveLength(1);
  });

  it("token inválido não revela nada e cliente anônimo não chama RPCs", async () => {
    expect((await rpc<{ status: string }>(admin, "invitation_preview", { p_token: "x".repeat(43) })).status).toBe("invalid");
    const anon = anonClient();
    const err = await rpcError(anon, "accept_invitation", { p_token: "x".repeat(43) });
    expect(err.code).toBe("42501"); // permission denied
    const err2 = await rpcError(anon, "invitation_preview", { p_token: "x".repeat(43) });
    expect(err2.code).toBe("42501");
  });

  it("e-mail existente é vinculado sem duplicar pessoa nem conceder acesso por nome", async () => {
    // Usuário já existente (ex.: responsável) recebe convite como aluno adulto.
    const email = uniqueEmail("existente");
    await createUser(email);
    const created = await rpc<{ student_id: string; invitation: { token: string } }>(
      org.coach, "create_student", { p_payload: { full_name: "Mesmo Nome", kind: "adult", email, invite: true } });
    // Homônimo com outro e-mail não ganha acesso.
    const homonimo = await rpc<{ student_id: string }>(org.coach, "create_student", {
      p_payload: { full_name: "Mesmo Nome", kind: "adult", email: uniqueEmail("homonimo") } });
    const s = await signIn(email);
    expect((await rpc<{ ok: boolean }>(s, "accept_invitation", { p_token: created.invitation.token })).ok).toBe(true);
    const { data } = await s.client.from("students").select("id");
    expect(data!.map((r) => r.id)).toEqual([created.student_id]);
    expect(data!.map((r) => r.id)).not.toContain(homonimo.student_id);
    const users = await sql("select id from auth.users where lower(email) = $1", [email]);
    expect(users).toHaveLength(1);
  });
});
