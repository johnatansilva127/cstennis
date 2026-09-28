-- =============================================================================
-- Link de nova senha gerado pelo professor (acesso sem e-mail).
-- A função autoriza e audita; o servidor gera o link com a chave de serviço.
-- =============================================================================
create or replace function public.authorize_password_link(p_kind public.invitation_kind, p_target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_guardian public.guardians;
  v_user uuid;
begin
  if p_kind = 'student' then
    v_student := private.coach_student(p_target_id);
    select l.user_id into v_user
      from public.student_user_links l
     where l.student_id = p_target_id and l.revoked_at is null;
    if v_user is null then
      perform private.fail('CS409', 'Este aluno não tem acesso ativo.');
    end if;
    perform private.audit(v_student.organization_id, 'password_link.create', 'student', p_target_id, p_target_id,
      jsonb_build_object('user_id', v_user));
  else
    v_guardian := private.coach_guardian(p_target_id);
    v_user := v_guardian.user_id;
    if v_user is null then
      perform private.fail('CS409', 'Este responsável não tem acesso ativo.');
    end if;
    perform private.audit(v_guardian.organization_id, 'password_link.create', 'guardian', p_target_id, null,
      jsonb_build_object('user_id', v_user));
  end if;
  return v_user;
end;
$$;

-- Funções novas nascem executáveis por PUBLIC/anon: revogar antes de conceder.
revoke execute on function public.authorize_password_link(public.invitation_kind, uuid) from public, anon;
grant execute on function public.authorize_password_link(public.invitation_kind, uuid) to authenticated;
