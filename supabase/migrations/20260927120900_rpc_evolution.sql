-- =============================================================================
-- RPCs: cadastro completo de aluno, avaliações, metas, jogos, comentários,
-- avisos, privacidade (acesso/exportação/anonimização).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cadastro completo e atômico do aluno
-- payload: {full_name, kind, email, phone, level, private_note,
--           guardian: {id} | {full_name, email, phone, relationship},
--           tuition: {amount_cents, due_day, starts_month},
--           enrollments: [{series_id, valid_from}],
--           invite: boolean}
-- -----------------------------------------------------------------------------
create or replace function public.create_student(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_today date := private.org_today(v_org);
  v_kind public.student_kind;
  v_email text := private.normalize_email(p_payload ->> 'email');
  v_student public.students;
  v_guardian uuid;
  v_invitation jsonb;
  v_enr jsonb;
  v_series public.recurring_slots;
  v_from date;
begin
  begin
    v_kind := (p_payload ->> 'kind')::public.student_kind;
  exception when others then
    perform private.fail('CS422', 'Informe se o aluno é adulto ou criança.');
  end;
  if v_kind is null then
    perform private.fail('CS422', 'Informe se o aluno é adulto ou criança.');
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('CS422', 'E-mail do aluno inválido.');
  end if;
  if private.clean_text(p_payload ->> 'full_name', 120) is null or char_length(btrim(p_payload ->> 'full_name')) < 2 then
    perform private.fail('CS422', 'Informe o nome do aluno.');
  end if;
  if v_kind = 'adult' and v_email is null and private.clean_text(p_payload ->> 'phone', 20) is null then
    perform private.fail('CS422', 'Aluno adulto precisa de e-mail ou telefone.');
  end if;
  perform private.enforce_rate_limit('student:create:' || v_org::text, 100, 3600);

  insert into public.students (organization_id, full_name, kind, email, phone, level, status_effective_date, created_by)
  values (v_org, private.clean_text(p_payload ->> 'full_name', 120), v_kind, v_email,
          private.clean_text(p_payload ->> 'phone', 20), private.clean_text(p_payload ->> 'level', 60), v_today, auth.uid())
  returning * into v_student;
  insert into public.student_status_changes (organization_id, student_id, status, effective_date, reason, created_by)
  values (v_org, v_student.id, 'active', v_today, 'Cadastro', auth.uid());

  if private.clean_text(p_payload ->> 'private_note', 4000) is not null then
    insert into public.student_private_notes (student_id, organization_id, note, updated_by)
    values (v_student.id, v_org, private.clean_text(p_payload ->> 'private_note', 4000), auth.uid());
  end if;

  perform private.audit(v_org, 'student.create', 'student', v_student.id, v_student.id,
    jsonb_build_object('kind', v_kind, 'has_email', v_email is not null));

  -- Responsável (crianças)
  if p_payload ? 'guardian' and jsonb_typeof(p_payload -> 'guardian') = 'object' then
    if v_kind <> 'child' then
      perform private.fail('CS422', 'Responsável só pode ser informado para aluno criança.');
    end if;
    if (p_payload -> 'guardian') ? 'id' then
      v_guardian := (p_payload -> 'guardian' ->> 'id')::uuid;
      if not exists (select 1 from public.guardians where id = v_guardian and organization_id = v_org and status = 'active') then
        perform private.fail('CS404', 'Responsável não encontrado.');
      end if;
    else
      v_guardian := private.create_guardian_internal(v_org, p_payload -> 'guardian');
    end if;
    insert into public.guardian_student_links (organization_id, guardian_id, student_id, relationship, created_by)
    values (v_org, v_guardian, v_student.id, private.clean_text(p_payload -> 'guardian' ->> 'relationship', 40), auth.uid());
    perform private.audit(v_org, 'guardian_link.create', 'guardian_student_link', v_guardian, v_student.id,
      jsonb_build_object('guardian_id', v_guardian));
  elsif v_kind = 'child' then
    perform private.fail('CS422', 'Aluno criança precisa de um responsável.');
  end if;

  -- Plano de mensalidade
  if p_payload ? 'tuition' and jsonb_typeof(p_payload -> 'tuition') = 'object' then
    perform private.set_tuition_internal(v_student,
      (p_payload -> 'tuition' ->> 'amount_cents')::int,
      (p_payload -> 'tuition' ->> 'due_day')::int,
      coalesce((p_payload -> 'tuition' ->> 'starts_month')::date, date_trunc('month', v_today)::date),
      null, null);
  end if;

  -- Horários fixos (com validação de capacidade e conflitos)
  if p_payload ? 'enrollments' and jsonb_typeof(p_payload -> 'enrollments') = 'array' then
    for v_enr in select value from jsonb_array_elements(p_payload -> 'enrollments') loop
      select * into v_series from public.recurring_slots
       where id = (v_enr ->> 'series_id')::uuid and organization_id = v_org;
      if v_series.id is null then
        perform private.fail('CS404', 'Horário não encontrado.');
      end if;
      v_from := coalesce((v_enr ->> 'valid_from')::date, greatest(v_today, v_series.valid_from));
      if v_from < v_today then
        perform private.fail('CS422', 'Matrícula no cadastro deve começar hoje ou depois.');
      end if;
      perform private.enroll_lineage(v_student, v_series.series_root_id, v_from, null, 'direct', null);
    end loop;
  end if;

  -- Convite (adulto → aluno; criança → responsável sem acesso)
  if coalesce((p_payload ->> 'invite')::boolean, false) then
    if v_kind = 'adult' then
      if v_email is null then
        perform private.fail('CS422', 'Informe o e-mail do aluno para gerar o convite.');
      end if;
      v_invitation := private.create_invitation_internal(v_org, 'student', v_student.id, v_email);
    elsif v_guardian is not null and not exists (select 1 from public.guardians where id = v_guardian and user_id is not null) then
      if (select email from public.guardians where id = v_guardian) is null then
        perform private.fail('CS422', 'Informe o e-mail do responsável para gerar o convite.');
      end if;
      v_invitation := private.create_invitation_internal(v_org, 'guardian', v_guardian,
                                                         (select email from public.guardians where id = v_guardian));
    end if;
  end if;

  return jsonb_build_object('student_id', v_student.id, 'guardian_id', v_guardian, 'invitation', v_invitation);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform private.fail('CS422', 'Dados do cadastro inválidos.');
  when check_violation then
    perform private.fail('CS422', 'Dados do cadastro inválidos (verifique e-mail e telefone).');
end;
$$;

-- -----------------------------------------------------------------------------
-- Avaliações
-- -----------------------------------------------------------------------------
create or replace function public.save_assessment(p_assessment_id uuid, p_student_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assessments;
  v_s public.students;
  v_id uuid := p_assessment_id;
  v_score jsonb;
  v_skill public.tennis_skill;
  v_value smallint;
  v_note text := private.clean_text(p_payload ->> 'private_note', 3000);
  v_before jsonb;
begin
  if v_id is null then
    v_s := private.coach_student(p_student_id);
    insert into public.assessments (organization_id, student_id, assessed_on, summary, created_by, updated_by)
    values (v_s.organization_id, v_s.id, coalesce((p_payload ->> 'assessed_on')::date, private.org_today(v_s.organization_id)),
            private.clean_text(p_payload ->> 'summary', 3000), auth.uid(), auth.uid())
    returning * into v;
    v_id := v.id;
  else
    select * into v from public.assessments where id = v_id for update;
    perform private.require_coach(v.organization_id);
    select jsonb_build_object('summary', v.summary, 'assessed_on', v.assessed_on,
             'scores', (select jsonb_object_agg(skill, score) from public.assessment_scores where assessment_id = v.id))
      into v_before;
    update public.assessments set
      assessed_on = coalesce((p_payload ->> 'assessed_on')::date, assessed_on),
      summary = private.clean_text(p_payload ->> 'summary', 3000),
      updated_by = auth.uid(), updated_at = now()
    where id = v.id;
  end if;

  if p_payload ? 'scores' then
    if jsonb_typeof(p_payload -> 'scores') <> 'object' then
      perform private.fail('CS422', 'Notas inválidas.');
    end if;
    for v_score in select jsonb_build_object('skill', key, 'value', value) from jsonb_each(p_payload -> 'scores') loop
      begin
        v_skill := (v_score ->> 'skill')::public.tennis_skill;
        v_value := nullif(v_score -> 'value' ->> 'score', '')::smallint;
      exception when others then
        perform private.fail('CS422', 'Fundamento ou nota inválida.');
      end;
      if v_value is not null and (v_value < 1 or v_value > 5) then
        perform private.fail('CS422', 'Notas vão de 1 a 5 (ou "não avaliado").');
      end if;
      insert into public.assessment_scores (assessment_id, organization_id, skill, score, comment)
      values (v_id, v.organization_id, v_skill, v_value, private.clean_text(v_score -> 'value' ->> 'comment', 500))
      on conflict (assessment_id, skill) do update set score = excluded.score, comment = excluded.comment;
    end loop;
  end if;

  if v_note is not null then
    insert into public.assessment_private_notes (assessment_id, organization_id, note, updated_by)
    values (v_id, v.organization_id, v_note, auth.uid())
    on conflict (assessment_id) do update set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  elsif p_payload ? 'private_note' then
    delete from public.assessment_private_notes where assessment_id = v_id;
  end if;

  perform private.audit(v.organization_id, case when p_assessment_id is null then 'assessment.create' else 'assessment.update' end,
    'assessment', v_id, v.student_id,
    jsonb_build_object('status', v.status, 'before', v_before,
                       'after', jsonb_build_object('summary_changed', v_before is null or (v_before ->> 'summary') is distinct from (p_payload ->> 'summary'),
                                                   'scores', p_payload -> 'scores')));
  return v_id;
exception
  when invalid_datetime_format or invalid_text_representation then
    perform private.fail('CS422', 'Data inválida.');
end;
$$;

create or replace function public.publish_assessment(p_assessment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assessments;
begin
  select * into v from public.assessments where id = p_assessment_id for update;
  perform private.require_coach(v.organization_id);
  if v.status = 'published' then
    return;
  end if;
  if not exists (select 1 from public.assessment_scores where assessment_id = v.id and score is not null)
     and v.summary is null then
    perform private.fail('CS422', 'Inclua ao menos uma nota ou um comentário antes de publicar.');
  end if;
  update public.assessments set status = 'published', published_at = now(), published_by = auth.uid(),
         updated_by = auth.uid(), updated_at = now()
   where id = v.id;
  perform private.audit(v.organization_id, 'assessment.publish', 'assessment', v.id, v.student_id, '{}'::jsonb);
  perform private.emit(v.organization_id, 'assessment_published',
    jsonb_build_object('assessment_id', v.id, 'student_id', v.student_id), 'assessment_published:' || v.id::text);
end;
$$;

create or replace function public.delete_assessment_draft(p_assessment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assessments;
begin
  select * into v from public.assessments where id = p_assessment_id for update;
  perform private.require_coach(v.organization_id);
  if v.status <> 'draft' then
    perform private.fail('CS409', 'Avaliações publicadas não podem ser apagadas.');
  end if;
  delete from public.assessments where id = v.id;
  perform private.audit(v.organization_id, 'assessment.delete_draft', 'assessment', v.id, v.student_id, '{}'::jsonb);
end;
$$;

create or replace function public.save_goal(p_goal_id uuid, p_student_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.goals;
  v_s public.students;
  v_id uuid := p_goal_id;
  v_desc text := private.clean_text(p_payload ->> 'description', 500);
  v_status public.goal_status;
begin
  begin
    v_status := coalesce((p_payload ->> 'status')::public.goal_status, 'open');
  exception when others then
    perform private.fail('CS422', 'Status inválido.');
  end;
  if v_desc is null or char_length(v_desc) < 3 then
    perform private.fail('CS422', 'Descreva a meta.');
  end if;
  if v_id is null then
    v_s := private.coach_student(p_student_id);
    insert into public.goals (organization_id, student_id, description, target_date, status, visible_to_student, created_by, updated_by,
                              achieved_at)
    values (v_s.organization_id, v_s.id, v_desc, nullif(p_payload ->> 'target_date', '')::date, v_status,
            coalesce((p_payload ->> 'visible_to_student')::boolean, true), auth.uid(), auth.uid(),
            case when v_status = 'achieved' then now() end)
    returning id into v_id;
    perform private.audit(v_s.organization_id, 'goal.create', 'goal', v_id, v_s.id, p_payload);
  else
    select * into v from public.goals where id = v_id for update;
    perform private.require_coach(v.organization_id);
    update public.goals set description = v_desc, target_date = nullif(p_payload ->> 'target_date', '')::date,
           status = v_status, visible_to_student = coalesce((p_payload ->> 'visible_to_student')::boolean, visible_to_student),
           updated_by = auth.uid(), updated_at = now(),
           achieved_at = case when v_status = 'achieved' then coalesce(achieved_at, now()) else null end
     where id = v.id;
    perform private.audit(v.organization_id, 'goal.update', 'goal', v.id, v.student_id,
      jsonb_build_object('before', jsonb_build_object('status', v.status, 'description', v.description), 'after', p_payload));
  end if;
  return v_id;
exception
  when invalid_datetime_format then
    perform private.fail('CS422', 'Data inválida.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Jogos
-- payload: {played_on, event_name, opponent_name, match_type, partner_name,
--           opponent2_name, format, result_kind, manual_outcome, comments,
--           sets: [{player_games, opponent_games, tiebreak_player,
--                   tiebreak_opponent, is_match_tiebreak}]}
-- result_kind: 'completed' | 'incomplete' | 'walkover_win' | 'walkover_loss'
--              | 'retired_win' | 'retired_loss'
-- -----------------------------------------------------------------------------
create or replace function public.save_match(p_match_id uuid, p_student_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.student_matches;
  v_student uuid := p_student_id;
  v_org uuid;
  v_id uuid := p_match_id;
  v_format public.match_format;
  v_type public.match_type;
  v_kind text := coalesce(p_payload ->> 'result_kind', 'completed');
  v_sets jsonb := coalesce(p_payload -> 'sets', '[]'::jsonb);
  v_winner text;
  v_outcome public.match_outcome;
  v_source text;
  v_played date;
  v_relation text;
  v_set jsonb;
  i int := 0;
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  if v_id is not null then
    select * into v from public.student_matches where id = v_id for update;
    if v.id is null then
      perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
    end if;
    v_student := v.student_id;
  end if;
  perform private.require_module_access(v_student);
  v_relation := private.relation_to_student(v_student);
  select organization_id into v_org from public.students where id = v_student;
  perform private.enforce_rate_limit('match:save:' || auth.uid()::text, 60, 3600);

  begin
    v_format := (p_payload ->> 'format')::public.match_format;
    v_type := coalesce((p_payload ->> 'match_type')::public.match_type, 'singles');
    v_played := (p_payload ->> 'played_on')::date;
  exception when others then
    perform private.fail('CS422', 'Dados do jogo inválidos.');
  end;
  if v_format is null or v_played is null then
    perform private.fail('CS422', 'Informe data e formato do jogo.');
  end if;
  if v_played > private.org_today(v_org) then
    perform private.fail('CS422', 'A data do jogo não pode ser futura.');
  end if;
  if private.clean_text(p_payload ->> 'opponent_name', 80) is null then
    perform private.fail('CS422', 'Informe o adversário (nome ou apelido).');
  end if;
  if jsonb_typeof(v_sets) <> 'array' or jsonb_array_length(v_sets) > 5 then
    perform private.fail('CS422', 'Placar inválido.');
  end if;

  if v_kind in ('walkover_win', 'walkover_loss') then
    if jsonb_array_length(v_sets) > 0 then
      perform private.fail('CS422', 'W.O. não tem placar.');
    end if;
    v_outcome := v_kind::public.match_outcome;
    v_source := 'declared';
  elsif v_format = 'custom' then
    -- Formato livre: resultado informado manualmente e identificado como tal.
    begin
      v_outcome := coalesce(p_payload ->> 'manual_outcome', case v_kind when 'completed' then null else v_kind end)::public.match_outcome;
    exception when others then
      perform private.fail('CS422', 'Resultado inválido.');
    end;
    if v_outcome is null then
      perform private.fail('CS422', 'No formato livre, informe o resultado manualmente.');
    end if;
    v_source := 'manual';
  else
    v_winner := private.evaluate_match_score(v_format, v_sets, v_kind in ('incomplete', 'retired_win', 'retired_loss'));
    if v_kind = 'completed' then
      if v_winner = 'none' then
        perform private.fail('CS422', 'Placar incompleto para o formato. Marque como "incompleto" ou "desistência" se o jogo não terminou.');
      end if;
      v_outcome := case v_winner when 'player' then 'win'::public.match_outcome else 'loss'::public.match_outcome end;
      v_source := 'computed';
    elsif v_kind = 'incomplete' then
      if v_winner <> 'none' then
        perform private.fail('CS422', 'O placar indica jogo concluído; marque como concluído.');
      end if;
      v_outcome := 'incomplete';
      v_source := 'declared';
    elsif v_kind in ('retired_win', 'retired_loss') then
      if v_winner <> 'none' then
        perform private.fail('CS422', 'O placar indica jogo concluído; não pode ser desistência.');
      end if;
      v_outcome := v_kind::public.match_outcome;
      v_source := 'declared';
    else
      perform private.fail('CS422', 'Tipo de resultado inválido.');
    end if;
  end if;

  if v_id is null then
    insert into public.student_matches (organization_id, student_id, played_on, event_name, opponent_name, match_type,
                                        partner_name, opponent2_name, format, outcome, outcome_source, comments,
                                        created_by, author_kind, updated_by)
    values (v_org, v_student, v_played, private.clean_text(p_payload ->> 'event_name', 120),
            private.clean_text(p_payload ->> 'opponent_name', 80), v_type,
            case when v_type = 'doubles' then private.clean_text(p_payload ->> 'partner_name', 80) end,
            case when v_type = 'doubles' then private.clean_text(p_payload ->> 'opponent2_name', 80) end,
            v_format, v_outcome, v_source, private.clean_text(p_payload ->> 'comments', 2000),
            auth.uid(), coalesce(v_relation, 'student'), auth.uid())
    returning id into v_id;
  else
    update public.student_matches set played_on = v_played, event_name = private.clean_text(p_payload ->> 'event_name', 120),
           opponent_name = private.clean_text(p_payload ->> 'opponent_name', 80), match_type = v_type,
           partner_name = case when v_type = 'doubles' then private.clean_text(p_payload ->> 'partner_name', 80) end,
           opponent2_name = case when v_type = 'doubles' then private.clean_text(p_payload ->> 'opponent2_name', 80) end,
           format = v_format, outcome = v_outcome, outcome_source = v_source,
           comments = private.clean_text(p_payload ->> 'comments', 2000), updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    delete from public.match_sets where match_id = v_id;
  end if;

  for v_set in select value from jsonb_array_elements(v_sets) loop
    i := i + 1;
    insert into public.match_sets (match_id, organization_id, set_number, player_games, opponent_games,
                                   tiebreak_player, tiebreak_opponent, is_match_tiebreak)
    values (v_id, v_org, i, coalesce((v_set ->> 'player_games')::smallint, 0), coalesce((v_set ->> 'opponent_games')::smallint, 0),
            (v_set ->> 'tiebreak_player')::smallint, (v_set ->> 'tiebreak_opponent')::smallint,
            coalesce((v_set ->> 'is_match_tiebreak')::boolean, false));
  end loop;

  perform private.audit(v_org, case when p_match_id is null then 'match.create' else 'match.update' end,
    'student_match', v_id, v_student, jsonb_build_object('outcome', v_outcome, 'format', v_format));
  return v_id;
exception
  when check_violation or numeric_value_out_of_range or invalid_text_representation then
    perform private.fail('CS422', 'Placar inválido.');
end;
$$;

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.student_matches;
begin
  select * into v from public.student_matches where id = p_match_id for update;
  if v.id is null then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  perform private.require_module_access(v.student_id);
  if exists (select 1 from public.match_coach_comments where match_id = v.id) then
    perform private.fail('CS409', 'Jogos com comentário do professor não podem ser apagados.');
  end if;
  delete from public.student_matches where id = v.id;
  perform private.audit(v.organization_id, 'match.delete', 'student_match', v.id, v.student_id, '{}'::jsonb);
end;
$$;

create or replace function public.add_match_comment(p_match_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.student_matches;
  v_id uuid;
  v_body text := private.clean_text(p_body, 2000);
begin
  select * into v from public.student_matches where id = p_match_id;
  perform private.require_coach(v.organization_id);
  if v_body is null then
    perform private.fail('CS422', 'Escreva o comentário.');
  end if;
  insert into public.match_coach_comments (organization_id, match_id, author_user_id, body)
  values (v.organization_id, v.id, auth.uid(), v_body)
  returning id into v_id;
  perform private.audit(v.organization_id, 'match_comment.create', 'match_coach_comment', v_id, v.student_id, '{}'::jsonb);
  perform private.emit(v.organization_id, 'match_commented',
    jsonb_build_object('match_id', v.id, 'student_id', v.student_id), 'match_commented:' || v_id::text);
  return v_id;
end;
$$;

create or replace function public.update_match_comment(p_comment_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.match_coach_comments;
  v_body text := private.clean_text(p_body, 2000);
begin
  select * into v from public.match_coach_comments where id = p_comment_id for update;
  perform private.require_coach(v.organization_id);
  if v.author_user_id <> auth.uid() then
    perform private.fail('CS403', 'Somente o autor pode editar o comentário.');
  end if;
  if v_body is null then
    perform private.fail('CS422', 'Escreva o comentário.');
  end if;
  update public.match_coach_comments set body = v_body, updated_at = now() where id = v.id;
  perform private.audit(v.organization_id, 'match_comment.update', 'match_coach_comment', v.id, null,
    jsonb_build_object('before_length', char_length(v.body)));
end;
$$;

-- Estatísticas: vitórias/derrotas apenas de partidas concluídas (placar
-- computado ou resultado manual em formato livre). W.O., desistências e
-- incompletos aparecem separados.
create or replace function public.match_stats(p_student_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  r record;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if not private.is_coach_of(v_org) then
    perform private.require_module_access(p_student_id);
  end if;
  select count(*) filter (where outcome = 'win' and outcome_source in ('computed', 'manual')) as wins,
         count(*) filter (where outcome = 'loss' and outcome_source in ('computed', 'manual')) as losses,
         count(*) filter (where outcome = 'walkover_win') as wo_wins,
         count(*) filter (where outcome = 'walkover_loss') as wo_losses,
         count(*) filter (where outcome = 'retired_win') as ret_wins,
         count(*) filter (where outcome = 'retired_loss') as ret_losses,
         count(*) filter (where outcome = 'incomplete') as incomplete,
         count(*) as total
    into r
    from public.student_matches
   where student_id = p_student_id and played_on between p_from and p_to;
  return jsonb_build_object(
    'total', r.total, 'completed', r.wins + r.losses, 'wins', r.wins, 'losses', r.losses,
    'win_rate', case when r.wins + r.losses = 0 then null else round(r.wins::numeric * 100 / (r.wins + r.losses), 1) end,
    'walkover_wins', r.wo_wins, 'walkover_losses', r.wo_losses,
    'retired_wins', r.ret_wins, 'retired_losses', r.ret_losses, 'incomplete', r.incomplete);
end;
$$;

-- -----------------------------------------------------------------------------
-- Avisos
-- -----------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  update public.notifications set read_at = now()
   where recipient_user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privacidade
-- -----------------------------------------------------------------------------
create or replace function public.create_privacy_request(p_student_id uuid, p_kind public.privacy_request_kind, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  if p_student_id is not null then
    if not private.can_access_student(p_student_id) then
      perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
    end if;
    select organization_id into v_org from public.students where id = p_student_id;
  else
    select organization_id into v_org from public.organization_memberships
     where user_id = auth.uid() and status = 'active' limit 1;
  end if;
  if v_org is null then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  perform private.enforce_rate_limit('privacy:' || auth.uid()::text, 5, 86400);
  insert into public.privacy_requests (organization_id, student_id, requested_by, kind, details)
  values (v_org, p_student_id, auth.uid(), p_kind, private.clean_text(p_details, 2000))
  returning id into v_id;
  perform private.audit(v_org, 'privacy_request.create', 'privacy_request', v_id, p_student_id, jsonb_build_object('kind', p_kind));
  perform private.emit(v_org, 'privacy_request_created', jsonb_build_object('request_id', v_id, 'student_id', p_student_id),
                       'privacy_request_created:' || v_id::text);
  return v_id;
end;
$$;

create or replace function public.resolve_privacy_request(p_request_id uuid, p_status public.privacy_request_status, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.privacy_requests;
begin
  select * into v from public.privacy_requests where id = p_request_id for update;
  perform private.require_coach(v.organization_id);
  if p_status in ('completed', 'rejected') and private.clean_text(p_resolution, 2000) is null then
    perform private.fail('CS422', 'Descreva a resolução.');
  end if;
  update public.privacy_requests set status = p_status, resolution = private.clean_text(p_resolution, 2000),
         handled_by = auth.uid(), handled_at = now()
   where id = v.id;
  perform private.audit(v.organization_id, 'privacy_request.update', 'privacy_request', v.id, v.student_id,
    jsonb_build_object('status', p_status));
end;
$$;

-- Exportação dos dados do aluno. O professor recebe tudo (inclusive notas
-- privadas); contas vinculadas recebem os dados que já podem ver no app.
create or replace function public.export_student_data(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_is_coach boolean;
  v jsonb;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  v_is_coach := private.is_coach_of(v_org);
  if not v_is_coach and not private.can_access_student(p_student_id) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if v_is_coach then
    perform private.require_recent_mfa();
  end if;
  perform private.enforce_rate_limit('export:' || auth.uid()::text, 10, 3600);
  select jsonb_build_object(
    'generated_at', now(),
    'student', (select to_jsonb(s) - 'created_by' from public.students s where s.id = p_student_id),
    'guardians', (select coalesce(jsonb_agg(jsonb_build_object('full_name', g.full_name, 'email', g.email, 'phone', g.phone,
                                                               'relationship', gl.relationship, 'linked_at', gl.created_at,
                                                               'revoked_at', gl.revoked_at)), '[]')
                    from public.guardian_student_links gl join public.guardians g on g.id = gl.guardian_id
                   where gl.student_id = p_student_id),
    'enrollments', (select coalesce(jsonb_agg(to_jsonb(e) - 'created_by' - 'ended_by'), '[]') from public.enrollments e where e.student_id = p_student_id),
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object('date', o.local_date, 'start', o.start_time, 'status', a.status)), '[]')
                     from public.attendance a join public.lesson_occurrences o on o.id = a.occurrence_id where a.student_id = p_student_id),
    'tuition_terms', (select coalesce(jsonb_agg(to_jsonb(t) - 'created_by'), '[]') from public.tuition_terms t where t.student_id = p_student_id),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(i) - 'created_by' - 'adjusted_by' - 'cancelled_by'), '[]') from public.invoices i where i.student_id = p_student_id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) - 'created_by' - 'idempotency_key'), '[]') from public.payments p where p.student_id = p_student_id),
    'payment_submissions', (select coalesce(jsonb_agg(to_jsonb(ps) - 'submitted_by' - 'reviewed_by'), '[]') from public.payment_submissions ps where ps.student_id = p_student_id),
    'assessments', (select coalesce(jsonb_agg(jsonb_build_object(
                        'assessed_on', a.assessed_on, 'status', a.status, 'summary', a.summary,
                        'scores', (select jsonb_object_agg(sc.skill, sc.score) from public.assessment_scores sc where sc.assessment_id = a.id),
                        'private_note', case when v_is_coach then (select n.note from public.assessment_private_notes n where n.assessment_id = a.id) end)), '[]')
                      from public.assessments a where a.student_id = p_student_id and (v_is_coach or a.status = 'published')),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g) - 'created_by' - 'updated_by'), '[]') from public.goals g
               where g.student_id = p_student_id and (v_is_coach or g.visible_to_student)),
    'matches', (select coalesce(jsonb_agg(to_jsonb(m) - 'created_by' - 'updated_by'), '[]') from public.student_matches m where m.student_id = p_student_id),
    'private_note', case when v_is_coach then (select note from public.student_private_notes where student_id = p_student_id) end
  ) into v;
  perform private.audit(v_org, 'student.export', 'student', p_student_id, p_student_id, jsonb_build_object('by_coach', v_is_coach));
  return v;
end;
$$;

-- Anonimização (exclusão de dados pessoais) de aluno arquivado. Registros
-- financeiros e de presença permanecem vinculados ao cadastro anonimizado;
-- arquivos de comprovantes são marcados para exclusão no storage (o servidor
-- remove os objetos e confirma). A decisão sobre o que manter cabe ao
-- controlador (ver docs/PRIVACIDADE.md).
create or replace function public.anonymize_student(p_student_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.students := private.coach_student(p_student_id);
  v_files jsonb;
begin
  perform private.require_recent_mfa();
  if v.status <> 'archived' then
    perform private.fail('CS409', 'Arquive o aluno antes de anonimizar.');
  end if;
  if v.anonymized_at is not null then
    perform private.fail('CS409', 'Cadastro já anonimizado.');
  end if;
  if private.clean_text(p_reason, 500) is null then
    perform private.fail('CS422', 'Informe o motivo/solicitação.');
  end if;
  update public.students set full_name = 'Aluno removido ' || left(v.id::text, 8), email = null, phone = null, level = null,
         anonymized_at = now(), updated_at = now()
   where id = v.id;
  delete from public.student_private_notes where student_id = v.id;
  update public.student_user_links set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Anonimização'
   where student_id = v.id and revoked_at is null;
  update public.guardian_student_links set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Anonimização'
   where student_id = v.id and revoked_at is null;
  update public.student_matches set opponent_name = 'removido', partner_name = null, opponent2_name = null,
         comments = null, event_name = null
   where student_id = v.id;
  update public.match_coach_comments c set body = '[removido]'
    from public.student_matches m where m.id = c.match_id and m.student_id = v.id;
  delete from public.assessment_private_notes n using public.assessments a where a.id = n.assessment_id and a.student_id = v.id;
  update public.assessments set summary = null where student_id = v.id;
  update public.assessment_scores sc set comment = null from public.assessments a where a.id = sc.assessment_id and a.student_id = v.id;
  update public.goals set description = '[removido]' where student_id = v.id;
  update public.payment_submissions set payer_note = null where student_id = v.id;
  update public.notifications set body = '[removido]' where student_id = v.id;

  select coalesce(jsonb_agg(jsonb_build_object('file_id', f.id, 'bucket', f.bucket, 'object_path', f.object_path)), '[]')
    into v_files
    from public.file_objects f join public.payment_submissions s on s.file_id = f.id
   where s.student_id = v.id and f.status = 'stored';

  perform private.audit(v.organization_id, 'student.anonymize', 'student', v.id, v.id, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('files', v_files);
end;
$$;

-- Confirma exclusão de objetos no storage (service_role).
create or replace function public.mark_file_deleted(p_file_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.file_objects set status = 'deleted', deleted_at = now(), deleted_reason = left(coalesce(p_reason, 'deleted'), 200)
   where id = p_file_id and status <> 'deleted';
end;
$$;
