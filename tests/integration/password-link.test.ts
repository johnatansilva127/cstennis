import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient, createAdultStudent, createLinkedAdult, createLinkedChild, rpc, rpcError, setupOrg, sql, type Org,
} from "../helpers/db";

describe("Link de nova senha gerado pelo professor", () => {
  let org: Org;
  let other: Org;
  beforeAll(async () => {
    org = await setupOrg();
    other = await setupOrg();
  });

  it("autoriza aluno com acesso ativo e registra auditoria", async () => {
    const { studentId, session } = await createLinkedAdult(org);
    const userId = await rpc<string>(org.coach, "authorize_password_link", { p_kind: "student", p_target_id: studentId });
    expect(userId).toBe(session.userId);
    const audit = await sql<{ actor_role: string; diff: { user_id: string } }>(
      "select actor_role, diff from public.audit_events where action = 'password_link.create' and entity_id = $1", [studentId]);
    expect(audit).toEqual([{ actor_role: "coach", diff: { user_id: session.userId } }]);
  });

  it("autoriza responsável com acesso ativo", async () => {
    const { guardianId, session } = await createLinkedChild(org);
    expect(await rpc<string>(org.coach, "authorize_password_link", { p_kind: "guardian", p_target_id: guardianId }))
      .toBe(session!.userId);
  });

  it("recusa aluno sem acesso ativo", async () => {
    const { student_id } = await createAdultStudent(org);
    const err = await rpcError(org.coach, "authorize_password_link", { p_kind: "student", p_target_id: student_id });
    expect(err.code).toBe("CS409");
  });

  it("recusa outra organização, o próprio aluno e anônimo, sem auditar", async () => {
    const { studentId, session } = await createLinkedAdult(org);
    const args = { p_kind: "student", p_target_id: studentId };
    expect((await rpcError(other.coach, "authorize_password_link", args)).code).toBe("CS404");
    expect((await rpcError(session, "authorize_password_link", args)).code).toBe("CS404");
    expect((await rpcError(anonClient(), "authorize_password_link", args)).code).toBe("42501");
    const audit = await sql("select 1 from public.audit_events where action = 'password_link.create' and entity_id = $1", [studentId]);
    expect(audit).toEqual([]);
  });
});
