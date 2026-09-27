-- =============================================================================
-- RPCs: contexto do usuário, organização, alunos, responsáveis e convites.
-- Todas SECURITY DEFINER com search_path vazio; autorização explícita.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de carregamento com verificação de organização
-- -----------------------------------------------------------------------------
create or replace function private.coach_student(p_student uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.students;
begin
  select * into v from public.students where id = p_student;
  perform private.require_coach(v.organization_id);
  return v;
end;
$$;

create or replace function private.coach_guardian(p_guardian uuid)
returns public.guardians
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.guardians;
begin
  select * into v from public.guardians where id = p_guardian;
  perform private.require_coach(v.organization_id);
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contexto do usuário (disponível mesmo antes do MFA, sem dados de negócio)
-- -----------------------------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  select jsonb_build_object(
    'user_id', v_uid,
    'email', (select email from auth.users where id = v_uid),
    'full_name', coalesce(p.full_name, ''),
    'theme', coalesce(p.theme_preference, 'system'),
    'aal', private.current_aal(),
    'is_coach', exists (select 1 from public.organization_memberships m
                         where m.user_id = v_uid and m.role = 'coach' and m.status = 'active'),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role, 'timezone', o.timezone) order by o.name)
        from public.organization_memberships m join public.organizations o on o.id = m.organization_id
       where m.user_id = v_uid and m.status = 'active'), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'full_name', s.full_name, 'kind', s.kind, 'status', s.status,
               'relation', private.relation_to_student(s.id),
               'restriction', private.restriction_level(s.id)) order by s.full_name)
        from public.students s where s.id in (select private.accessible_student_ids())), '[]'::jsonb)
  ) into v_result
  from (select 1) x
  left join public.user_profiles p on p.user_id = v_uid;
  return v_result;
end;
$$;

create or replace function public.update_my_profile(p_full_name text, p_theme public.theme_preference)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_text(p_full_name, 120);
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  insert into public.user_profiles (user_id, full_name, theme_preference, updated_at)
  values (auth.uid(), coalesce(v_name, ''), coalesce(p_theme, 'system'), now())
  on conflict (user_id) do update
    set full_name = coalesce(v_name, public.user_profiles.full_name),
        theme_preference = coalesce(p_theme, public.user_profiles.theme_preference),
        updated_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Provisionamento administrativo do professor (somente service_role)
-- -----------------------------------------------------------------------------
create or replace function public.bootstrap_coach(p_org_name text, p_user_id uuid, p_timezone text default 'America/Sao_Paulo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    perform private.fail('CS404', 'Usuário não encontrado.');
  end if;
  select m.organization_id into v_org
    from public.organization_memberships m
   where m.user_id = p_user_id and m.role = 'coach';
  if v_org is not null then
    return v_org;
  end if;
  insert into public.organizations (name, timezone) values (p_org_name, p_timezone) returning id into v_org;
  insert into public.organization_memberships (organization_id, user_id, role) values (v_org, p_user_id, 'coach');
  insert into public.access_policies (organization_id, student_id, mode, grace_days) values (v_org, null, 'warn_only', 0);
  perform private.audit(v_org, 'coach.bootstrap', 'organization', v_org, null, jsonb_build_object('user_id', p_user_id));
  return v_org;
end;
$$;

create or replace function public.update_organization_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_before jsonb;
begin
  select to_jsonb(o) into v_before from public.organizations o where o.id = v_org;
  update public.organizations o set
    name = coalesce(private.clean_text(p_settings ->> 'name', 120), o.name),
    invitation_ttl_hours = coalesce((p_settings ->> 'invitation_ttl_hours')::int, o.invitation_ttl_hours),
    invoice_lead_days = coalesce((p_settings ->> 'invoice_lead_days')::int, o.invoice_lead_days),
    default_travel_buffer_minutes = coalesce((p_settings ->> 'default_travel_buffer_minutes')::int, o.default_travel_buffer_minutes),
    lesson_reminder_hours = coalesce((p_settings ->> 'lesson_reminder_hours')::int, o.lesson_reminder_hours),
    due_soon_days = coalesce((p_settings ->> 'due_soon_days')::int, o.due_soon_days),
    proof_retention_days = case when p_settings ? 'proof_retention_days'
                                then (p_settings ->> 'proof_retention_days')::int else o.proof_retention_days end,
    privacy_controller = case when p_settings ? 'privacy_controller'
                              then private.clean_text(p_settings ->> 'privacy_controller', 200) else o.privacy_controller end,
    privacy_contact = case when p_settings ? 'privacy_contact'
                           then private.clean_text(p_settings ->> 'privacy_contact', 200) else o.privacy_contact end,
    contact_info = case when p_settings ? 'contact_info'
                        then private.clean_text(p_settings ->> 'contact_info', 500) else o.contact_info end
  where o.id = v_org;
  perform private.audit(v_org, 'organization.update', 'organization', v_org, null,
    jsonb_build_object('before', v_before - 'created_at', 'changes', p_settings));
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('CS422', 'Configuração inválida.');
  when check_violation then
    perform private.fail('CS422', 'Valor fora do intervalo permitido.');
end;
$$;

-- Informações públicas de contato/privacidade para qualquer membro.
create or replace function public.organization_public_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.name, 'timezone', o.timezone,
    'privacy_controller', o.privacy_controller, 'privacy_contact', o.privacy_contact,
    'contact_info', o.contact_info)), '[]'::jsonb)
  from public.organizations o
  where o.id in (select private.member_org_ids());
$$;

-- -----------------------------------------------------------------------------
-- Convites (internos)
-- -----------------------------------------------------------------------------
create or replace function private.create_invitation_internal(
  p_org uuid, p_kind public.invitation_kind, p_target uuid, p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(p_email);
  v_token text := private.new_token();
  v_inv_id uuid;
  v_expires timestamptz;
  v_ttl int;
begin
  if not private.is_valid_email(v_email) then
    perform private.fail('CS422', 'Informe um e-mail válido para o convite.');
  end if;
  perform private.enforce_rate_limit('invite:create:' || auth.uid()::text, 40, 3600);

  select invitation_ttl_hours into v_ttl from public.organizations where id = p_org;
  v_expires := now() + make_interval(hours => v_ttl);

  -- Revoga convite pendente anterior do mesmo destinatário.
  update public.invitations
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where status = 'pending'
     and ((p_kind = 'student' and student_id = p_target) or (p_kind = 'guardian' and guardian_id = p_target));

  insert into public.invitations (organization_id, kind, student_id, guardian_id, email, expires_at, created_by)
  values (p_org, p_kind,
          case when p_kind = 'student' then p_target end,
          case when p_kind = 'guardian' then p_target end,
          v_email, v_expires, auth.uid())
  returning id into v_inv_id;

  insert into private.invitation_tokens (invitation_id, token_hash) values (v_inv_id, private.hash_token(v_token));

  perform private.audit(p_org, 'invitation.create', 'invitation', v_inv_id,
    case when p_kind = 'student' then p_target end,
    jsonb_build_object('kind', p_kind, 'email', private.mask_email(v_email), 'expires_at', v_expires));

  -- O token em claro é devolvido UMA única vez para o professor copiar.
  return jsonb_build_object('invitation_id', v_inv_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.create_invitation(p_kind public.invitation_kind, p_target_id uuid, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_guardian public.guardians;
begin
  if p_kind = 'student' then
    v_student := private.coach_student(p_target_id);
    if v_student.kind <> 'adult' then
      perform private.fail('CS422', 'Crianças não recebem acesso próprio; convide o responsável.');
    end if;
    if v_student.status = 'archived' or v_student.anonymized_at is not null then
      perform private.fail('CS422', 'Aluno arquivado não pode receber convite.');
    end if;
    if exists (select 1 from public.student_user_links where student_id = p_target_id and revoked_at is null) then
      perform private.fail('CS409', 'Este aluno já tem acesso ativo.');
    end if;
    return private.create_invitation_internal(v_student.organization_id, 'student', p_target_id, coalesce(p_email, v_student.email));
  else
    v_guardian := private.coach_guardian(p_target_id);
    if v_guardian.status <> 'active' then
      perform private.fail('CS422', 'Responsável arquivado não pode receber convite.');
    end if;
    if v_guardian.user_id is not null then
      perform private.fail('CS409', 'Este responsável já tem acesso ativo.');
    end if;
    return private.create_invitation_internal(v_guardian.organization_id, 'guardian', p_target_id, coalesce(p_email, v_guardian.email));
  end if;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invitations;
begin
  select * into v from public.invitations where id = p_invitation_id for update;
  perform private.require_coach(v.organization_id);
  if v.status <> 'pending' then
    perform private.fail('CS409', 'Somente convites pendentes podem ser revogados.');
  end if;
  update public.invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = v.id;
  perform private.audit(v.organization_id, 'invitation.revoke', 'invitation', v.id, v.student_id, '{}'::jsonb);
end;
$$;

-- Pré-visualização segura (service_role; o servidor aplica limite por IP).
create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invitations;
  v_org_name text;
begin
  if p_token is null or char_length(p_token) < 40 or char_length(p_token) > 64 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select i.* into v
    from public.invitations i
    join private.invitation_tokens t on t.invitation_id = i.id
   where t.token_hash = private.hash_token(p_token);
  if v.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select name into v_org_name from public.organizations where id = v.organization_id;
  return jsonb_build_object(
    'status', case
      when v.status = 'accepted' then 'used'
      when v.status = 'revoked' then 'revoked'
      when v.expires_at <= now() then 'expired'
      when v.failed_attempts >= 5 then 'locked'
      else 'valid' end,
    'kind', v.kind,
    'organization_name', v_org_name,
    'masked_email', private.mask_email(v.email),
    'expires_at', v.expires_at);
end;
$$;

-- E-mail do destinatário para envio do código OTP (service_role). O e-mail
-- nunca vem do cliente: é sempre o e-mail registrado no convite.
create or replace function public.invitation_email_for_code(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invitations;
begin
  select i.* into v
    from public.invitations i
    join private.invitation_tokens t on t.invitation_id = i.id
   where t.token_hash = private.hash_token(p_token)
   for update of i;
  if v.id is null or v.status <> 'pending' or v.expires_at <= now() or v.failed_attempts >= 5 then
    return null;
  end if;
  if v.codes_sent >= 10 then
    perform private.fail('CS429', 'Limite de códigos atingido para este convite. Peça um novo convite ao professor.');
  end if;
  update public.invitations set codes_sent = codes_sent + 1 where id = v.id;
  return v.email;
end;
$$;

-- Aceitação atômica. Retorna jsonb {ok, code}. Tentativas com conta de outro
-- e-mail são contadas (e persistidas) e bloqueiam o convite após 5 falhas.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.invitations;
  v_user_email text;
  v_confirmed timestamptz;
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not private.hit_rate_limit('invite:accept:' || v_uid::text, 20, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if p_token is null or char_length(p_token) < 40 or char_length(p_token) > 64 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select i.* into v
    from public.invitations i
    join private.invitation_tokens t on t.invitation_id = i.id
   where t.token_hash = private.hash_token(p_token)
   for update of i;

  if v.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v.status = 'accepted' then
    return jsonb_build_object('ok', v.accepted_by = v_uid, 'code', case when v.accepted_by = v_uid then 'already_accepted' else 'used' end);
  end if;
  if v.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if v.failed_attempts >= 5 then
    return jsonb_build_object('ok', false, 'code', 'locked');
  end if;

  select lower(email), email_confirmed_at into v_user_email, v_confirmed from auth.users where id = v_uid;
  if v_user_email is distinct from v.email or v_confirmed is null then
    update public.invitations set failed_attempts = failed_attempts + 1 where id = v.id;
    perform private.audit(v.organization_id, 'invitation.wrong_recipient', 'invitation', v.id, v.student_id,
      jsonb_build_object('attempt', v.failed_attempts + 1));
    return jsonb_build_object('ok', false, 'code', 'wrong_recipient');
  end if;

  -- Professor não pode ser convidado como participante da própria organização.
  if exists (select 1 from public.organization_memberships
              where organization_id = v.organization_id and user_id = v_uid and role = 'coach') then
    return jsonb_build_object('ok', false, 'code', 'coach_account');
  end if;

  -- Verificações de conflito ANTES de qualquer escrita.
  if v.kind = 'student' then
    if exists (select 1 from public.student_user_links where student_id = v.student_id and revoked_at is null) then
      return jsonb_build_object('ok', false, 'code', 'target_already_linked');
    end if;
    if exists (select 1 from public.student_user_links
                where organization_id = v.organization_id and user_id = v_uid and revoked_at is null) then
      return jsonb_build_object('ok', false, 'code', 'user_already_student');
    end if;
  else
    if exists (select 1 from public.guardians
                where organization_id = v.organization_id and user_id = v_uid and id <> v.guardian_id) then
      return jsonb_build_object('ok', false, 'code', 'user_already_guardian');
    end if;
    if exists (select 1 from public.guardians
                where id = v.guardian_id and user_id is not null and user_id <> v_uid) then
      return jsonb_build_object('ok', false, 'code', 'target_already_linked');
    end if;
  end if;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (v.organization_id, v_uid, 'participant', 'active')
  on conflict (organization_id, user_id) do update set status = 'active', revoked_at = null
    where public.organization_memberships.role = 'participant';

  if v.kind = 'student' then
    insert into public.student_user_links (organization_id, student_id, user_id, invitation_id)
    values (v.organization_id, v.student_id, v_uid, v.id);
    select full_name into v_name from public.students where id = v.student_id;
  else
    update public.guardians set user_id = v_uid, updated_at = now() where id = v.guardian_id;
    select full_name into v_name from public.guardians where id = v.guardian_id;
  end if;

  update public.invitations set status = 'accepted', accepted_at = now(), accepted_by = v_uid where id = v.id;

  insert into public.user_profiles (user_id, full_name) values (v_uid, coalesce(v_name, ''))
  on conflict (user_id) do update set full_name = case when public.user_profiles.full_name = '' then excluded.full_name
                                                       else public.user_profiles.full_name end;

  perform private.audit(v.organization_id, 'invitation.accept', 'invitation', v.id, v.student_id,
    jsonb_build_object('kind', v.kind, 'user_id', v_uid));
  perform private.emit(v.organization_id, 'invitation_accepted',
    jsonb_build_object('invitation_id', v.id, 'kind', v.kind, 'name', v_name, 'student_id', v.student_id),
    'invitation_accepted:' || v.id::text);
  return jsonb_build_object('ok', true, 'code', 'accepted', 'kind', v.kind);
end;
$$;

-- -----------------------------------------------------------------------------
-- Responsáveis
-- -----------------------------------------------------------------------------
create or replace function private.create_guardian_internal(p_org uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(p_payload ->> 'email');
  v_phone text := private.clean_text(p_payload ->> 'phone', 20);
  v_name text := private.clean_text(p_payload ->> 'full_name', 120);
  v_id uuid;
begin
  if v_name is null or char_length(v_name) < 2 then
    perform private.fail('CS422', 'Informe o nome do responsável.');
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('CS422', 'E-mail do responsável inválido.');
  end if;
  if v_email is null and v_phone is null then
    perform private.fail('CS422', 'Informe e-mail ou telefone do responsável.');
  end if;
  if v_email is not null and exists (select 1 from public.guardians
                                      where organization_id = p_org and email = v_email and status = 'active') then
    perform private.fail('CS409', 'Já existe um responsável com este e-mail. Vincule o aluno ao responsável existente.');
  end if;
  insert into public.guardians (organization_id, full_name, email, phone, created_by)
  values (p_org, v_name, v_email, v_phone, auth.uid())
  returning id into v_id;
  perform private.audit(p_org, 'guardian.create', 'guardian', v_id, null,
    jsonb_build_object('email', private.mask_email(v_email)));
  return v_id;
exception
  when check_violation then
    perform private.fail('CS422', 'Dados do responsável inválidos (verifique e-mail e telefone).');
end;
$$;

create or replace function public.create_guardian(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.create_guardian_internal(private.my_coach_org(), p_payload);
end;
$$;

create or replace function public.update_guardian(p_guardian_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.guardians := private.coach_guardian(p_guardian_id);
  v_email text := private.normalize_email(p_payload ->> 'email');
begin
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('CS422', 'E-mail inválido.');
  end if;
  if v.user_id is not null and v_email is distinct from v.email then
    perform private.fail('CS409', 'O e-mail de um responsável com acesso ativo não pode ser alterado aqui.');
  end if;
  update public.guardians set
    full_name = coalesce(private.clean_text(p_payload ->> 'full_name', 120), full_name),
    email = v_email,
    phone = private.clean_text(p_payload ->> 'phone', 20),
    updated_at = now()
  where id = v.id;
  perform private.audit(v.organization_id, 'guardian.update', 'guardian', v.id, null,
    jsonb_build_object('name_changed', (p_payload ->> 'full_name') is distinct from v.full_name));
exception
  when check_violation then
    perform private.fail('CS422', 'Dados do responsável inválidos (informe e-mail ou telefone válidos).');
  when unique_violation then
    perform private.fail('CS409', 'Já existe um responsável com este e-mail.');
end;
$$;

create or replace function public.link_guardian_student(p_guardian_id uuid, p_student_id uuid, p_relationship text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.guardians := private.coach_guardian(p_guardian_id);
  v_s public.students := private.coach_student(p_student_id);
  v_id uuid;
begin
  if v_g.organization_id <> v_s.organization_id then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if v_s.kind <> 'child' then
    perform private.fail('CS422', 'Responsáveis são vinculados apenas a alunos crianças.');
  end if;
  if exists (select 1 from public.guardian_student_links
              where guardian_id = p_guardian_id and student_id = p_student_id and revoked_at is null) then
    perform private.fail('CS409', 'Este vínculo já existe.');
  end if;
  insert into public.guardian_student_links (organization_id, guardian_id, student_id, relationship, created_by)
  values (v_s.organization_id, p_guardian_id, p_student_id, private.clean_text(p_relationship, 40), auth.uid())
  returning id into v_id;
  perform private.audit(v_s.organization_id, 'guardian_link.create', 'guardian_student_link', v_id, p_student_id,
    jsonb_build_object('guardian_id', p_guardian_id));
  return v_id;
end;
$$;

create or replace function public.unlink_guardian_student(p_link_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.guardian_student_links;
begin
  select * into v from public.guardian_student_links where id = p_link_id for update;
  perform private.require_coach(v.organization_id);
  if v.revoked_at is not null then
    perform private.fail('CS409', 'Vínculo já revogado.');
  end if;
  if private.clean_text(p_reason, 500) is null then
    perform private.fail('CS422', 'Informe o motivo da revogação.');
  end if;
  update public.guardian_student_links
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = private.clean_text(p_reason, 500)
   where id = v.id;
  perform private.audit(v.organization_id, 'guardian_link.revoke', 'guardian_student_link', v.id, v.student_id,
    jsonb_build_object('guardian_id', v.guardian_id, 'reason', p_reason));
end;
$$;

-- Revoga o acesso de login (aluno adulto ou responsável) mantendo o cadastro.
create or replace function public.revoke_account_access(p_kind text, p_target_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.student_user_links;
  v_g public.guardians;
begin
  if private.clean_text(p_reason, 500) is null then
    perform private.fail('CS422', 'Informe o motivo.');
  end if;
  if p_kind = 'student' then
    select * into v_link from public.student_user_links where student_id = p_target_id and revoked_at is null for update;
    perform private.require_coach(coalesce(v_link.organization_id, (select organization_id from public.students where id = p_target_id)));
    if v_link.id is null then
      perform private.fail('CS409', 'Este aluno não tem acesso ativo.');
    end if;
    update public.student_user_links set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason where id = v_link.id;
    perform private.audit(v_link.organization_id, 'student_access.revoke', 'student', p_target_id, p_target_id,
      jsonb_build_object('user_id', v_link.user_id, 'reason', p_reason));
  elsif p_kind = 'guardian' then
    v_g := private.coach_guardian(p_target_id);
    if v_g.user_id is null then
      perform private.fail('CS409', 'Este responsável não tem acesso ativo.');
    end if;
    update public.guardians set user_id = null, updated_at = now() where id = v_g.id;
    perform private.audit(v_g.organization_id, 'guardian_access.revoke', 'guardian', v_g.id, null,
      jsonb_build_object('user_id', v_g.user_id, 'reason', p_reason));
  else
    perform private.fail('CS422', 'Tipo inválido.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alunos
-- -----------------------------------------------------------------------------
create or replace function public.update_student(p_student_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.students := private.coach_student(p_student_id);
  v_email text := private.normalize_email(p_payload ->> 'email');
begin
  if v.anonymized_at is not null then
    perform private.fail('CS409', 'Cadastro anonimizado não pode ser editado.');
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('CS422', 'E-mail inválido.');
  end if;
  update public.students set
    full_name = coalesce(private.clean_text(p_payload ->> 'full_name', 120), full_name),
    email = v_email,
    phone = private.clean_text(p_payload ->> 'phone', 20),
    level = private.clean_text(p_payload ->> 'level', 60),
    updated_at = now()
  where id = v.id;
  perform private.audit(v.organization_id, 'student.update', 'student', v.id, v.id,
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_payload) k)));
exception
  when check_violation then
    perform private.fail('CS422', 'Dados inválidos: adulto precisa de e-mail ou telefone válido.');
end;
$$;

create or replace function public.set_student_private_note(p_student_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.students := private.coach_student(p_student_id);
begin
  insert into public.student_private_notes (student_id, organization_id, note, updated_by, updated_at)
  values (v.id, v.organization_id, coalesce(private.clean_text(p_note, 4000), ''), auth.uid(), now())
  on conflict (student_id) do update set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Status administrativo com data efetiva. Arquivar/pausar pode encerrar as
-- matrículas a partir da data efetiva (vigência termina na véspera).
create or replace function public.set_student_status(
  p_student_id uuid, p_status public.student_status, p_effective_date date, p_reason text, p_end_enrollments boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.students := private.coach_student(p_student_id);
  v_today date := private.org_today(v.organization_id);
  v_end boolean := coalesce(p_end_enrollments, p_status = 'archived');
  r record;
begin
  if p_effective_date is null or p_effective_date < v_today - 31 then
    perform private.fail('CS422', 'Data efetiva inválida (no máximo 31 dias no passado).');
  end if;
  if v.anonymized_at is not null then
    perform private.fail('CS409', 'Cadastro anonimizado.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule:' || v.organization_id::text, 0));

  insert into public.student_status_changes (organization_id, student_id, status, effective_date, reason, created_by)
  values (v.organization_id, v.id, p_status, p_effective_date, private.clean_text(p_reason, 500), auth.uid());

  if p_effective_date <= v_today then
    update public.students set status = p_status, status_effective_date = p_effective_date, updated_at = now() where id = v.id;
  end if;

  if v_end and p_status <> 'active' then
    for r in select * from public.enrollments
              where student_id = v.id and status = 'active'
                and coalesce(valid_until, 'infinity'::date) >= p_effective_date
    loop
      if r.valid_from >= p_effective_date then
        update public.enrollments set status = 'cancelled', ended_by = auth.uid(), ended_at = now(),
               end_reason = 'Aluno ' || case p_status when 'archived' then 'arquivado' else 'pausado' end
         where id = r.id;
      else
        update public.enrollments set valid_until = p_effective_date - 1, ended_by = auth.uid(), ended_at = now(),
               end_reason = 'Aluno ' || case p_status when 'archived' then 'arquivado' else 'pausado' end
         where id = r.id;
      end if;
    end loop;
    update public.enrollment_requests set status = 'cancelled', decided_at = now(), decided_by = auth.uid(),
           decision_reason = 'Aluno ' || case p_status when 'archived' then 'arquivado' else 'pausado' end
     where student_id = v.id and status = 'pending';
  end if;

  perform private.audit(v.organization_id, 'student.status', 'student', v.id, v.id,
    jsonb_build_object('from', v.status, 'to', p_status, 'effective_date', p_effective_date,
                       'end_enrollments', v_end, 'reason', p_reason));
end;
$$;
