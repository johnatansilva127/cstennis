-- =============================================================================
-- RPCs de agenda: locais/quadras, séries, ocorrências, matrículas, pedidos,
-- indisponibilidades e chamada.
--
-- Toda mutação de agenda obtém um advisory lock transacional por organização,
-- serializando verificações de capacidade e conflito (sem "consultar e depois
-- inserir" fora de transação).
-- =============================================================================

create or replace function private.lock_schedule(p_org uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('schedule:' || p_org::text, 0));
$$;

create or replace function private.weekday_label(p_weekday int)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['segunda','terça','quarta','quinta','sexta','sábado','domingo'])[p_weekday];
$$;

create or replace function private.next_weekday_date(p_from date, p_weekday int)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_from + ((p_weekday - extract(isodow from p_from)::int + 7) % 7);
$$;

create or replace function private.fail_if_conflicts(p_conflicts text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_conflicts is not null and array_length(p_conflicts, 1) > 0 then
    perform private.fail('CS409', 'Conflito de agenda: ' || array_to_string(p_conflicts, '; ') || '.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Locais e quadras
-- -----------------------------------------------------------------------------
create or replace function public.save_location(p_location_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid := p_location_id;
  v_name text := private.clean_text(p_payload ->> 'name', 120);
begin
  if v_name is null or char_length(v_name) < 2 then
    perform private.fail('CS422', 'Informe o nome do local.');
  end if;
  if v_id is null then
    v_org := private.my_coach_org();
    insert into public.locations (organization_id, name, address, instructions)
    values (v_org, v_name, private.clean_text(p_payload ->> 'address', 300), private.clean_text(p_payload ->> 'instructions', 1000))
    returning id into v_id;
    perform private.audit(v_org, 'location.create', 'location', v_id, null, jsonb_build_object('name', v_name));
  else
    select organization_id into v_org from public.locations where id = v_id;
    perform private.require_coach(v_org);
    update public.locations set
      name = v_name,
      address = private.clean_text(p_payload ->> 'address', 300),
      instructions = private.clean_text(p_payload ->> 'instructions', 1000),
      active = coalesce((p_payload ->> 'active')::boolean, active),
      updated_at = now()
    where id = v_id;
    perform private.audit(v_org, 'location.update', 'location', v_id, null, p_payload);
  end if;
  return v_id;
exception
  when unique_violation then
    perform private.fail('CS409', 'Já existe um local com este nome.');
end;
$$;

create or replace function public.save_court(p_court_id uuid, p_location_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid := p_court_id;
  v_name text := private.clean_text(p_payload ->> 'name', 60);
begin
  if v_name is null then
    perform private.fail('CS422', 'Informe o nome da quadra.');
  end if;
  if v_id is null then
    select organization_id into v_org from public.locations where id = p_location_id;
    perform private.require_coach(v_org);
    insert into public.courts (organization_id, location_id, name, surface)
    values (v_org, p_location_id, v_name, private.clean_text(p_payload ->> 'surface', 40))
    returning id into v_id;
    perform private.audit(v_org, 'court.create', 'court', v_id, null, jsonb_build_object('name', v_name));
  else
    select organization_id into v_org from public.courts where id = v_id;
    perform private.require_coach(v_org);
    update public.courts set
      name = v_name,
      surface = private.clean_text(p_payload ->> 'surface', 40),
      active = coalesce((p_payload ->> 'active')::boolean, active)
    where id = v_id;
    perform private.audit(v_org, 'court.update', 'court', v_id, null, p_payload);
  end if;
  return v_id;
exception
  when unique_violation then
    perform private.fail('CS409', 'Já existe uma quadra com este nome neste local.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Séries
-- -----------------------------------------------------------------------------
create or replace function private.parse_series_payload(p_org uuid, p_payload jsonb, p_base public.recurring_slots)
returns public.recurring_slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.recurring_slots := p_base;
  v_loc public.locations;
  v_court public.courts;
begin
  v.organization_id := p_org;
  if p_payload ? 'weekday' then v.weekday := (p_payload ->> 'weekday')::smallint; end if;
  if p_payload ? 'start_time' then v.start_time := (p_payload ->> 'start_time')::time; end if;
  if p_payload ? 'duration_minutes' then v.duration_minutes := (p_payload ->> 'duration_minutes')::int; end if;
  if p_payload ? 'valid_from' then v.valid_from := (p_payload ->> 'valid_from')::date; end if;
  if p_payload ? 'valid_until' then v.valid_until := nullif(p_payload ->> 'valid_until', '')::date; end if;
  if p_payload ? 'format' then v.format := (p_payload ->> 'format')::public.lesson_format; end if;
  if p_payload ? 'location_id' then v.location_id := (p_payload ->> 'location_id')::uuid; end if;
  if p_payload ? 'court_id' then v.court_id := nullif(p_payload ->> 'court_id', '')::uuid; end if;
  if p_payload ? 'travel_buffer_minutes' then v.travel_buffer_minutes := (p_payload ->> 'travel_buffer_minutes')::int; end if;
  if p_payload ? 'level' then v.level := private.clean_text(p_payload ->> 'level', 60); end if;
  if p_payload ? 'title' then v.title := private.clean_text(p_payload ->> 'title', 80); end if;

  v.capacity := case v.format
    when 'individual' then 1
    when 'double' then 2
    else coalesce((p_payload ->> 'capacity')::smallint, v.capacity) end;

  if v.weekday is null or v.start_time is null or v.duration_minutes is null or v.valid_from is null
     or v.format is null or v.location_id is null then
    perform private.fail('CS422', 'Preencha dia da semana, horário, duração, início, formato e local.');
  end if;
  if v.format = 'group' and (v.capacity is null or v.capacity < 2 or v.capacity > 40) then
    perform private.fail('CS422', 'Turmas precisam ter capacidade entre 2 e 40 alunos.');
  end if;
  if v.duration_minutes < 15 or v.duration_minutes > 300 then
    perform private.fail('CS422', 'Duração deve ficar entre 15 e 300 minutos.');
  end if;
  if private.minutes_of(v.start_time) + v.duration_minutes > 1440 then
    perform private.fail('CS422', 'A aula precisa terminar no mesmo dia.');
  end if;
  if v.valid_until is not null and v.valid_until < v.valid_from then
    perform private.fail('CS422', 'A data final precisa ser igual ou posterior à data inicial.');
  end if;
  if v.travel_buffer_minutes is null then
    select default_travel_buffer_minutes into v.travel_buffer_minutes from public.organizations where id = p_org;
  end if;

  select * into v_loc from public.locations where id = v.location_id and organization_id = p_org;
  if v_loc.id is null or not v_loc.active then
    perform private.fail('CS422', 'Local inválido ou inativo.');
  end if;
  if v.court_id is not null then
    select * into v_court from public.courts where id = v.court_id and location_id = v.location_id;
    if v_court.id is null or not v_court.active then
      perform private.fail('CS422', 'Quadra inválida, inativa ou de outro local.');
    end if;
  end if;
  return v;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    perform private.fail('CS422', 'Dados do horário inválidos.');
end;
$$;

create or replace function private.series_conflict_list(p_s public.recurring_slots, p_exclude_root uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(distinct c.description)
    from private.series_conflicts(p_s.organization_id, p_s.weekday, p_s.start_time, p_s.duration_minutes,
                                  p_s.valid_from, p_s.valid_until, p_s.location_id, p_s.court_id,
                                  p_s.travel_buffer_minutes, p_exclude_root) c;
$$;

create or replace function public.create_series(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_today date := private.org_today(v_org);
  v public.recurring_slots;
  v_window int;
begin
  v := private.parse_series_payload(v_org, p_payload, null::public.recurring_slots);
  if v.valid_from < v_today then
    perform private.fail('CS422', 'O horário deve começar hoje ou em data futura.');
  end if;
  perform private.lock_schedule(v_org);
  perform private.fail_if_conflicts(private.series_conflict_list(v, null));

  insert into public.recurring_slots (organization_id, title, weekday, start_time, duration_minutes, valid_from, valid_until,
                                      format, capacity, location_id, court_id, travel_buffer_minutes, level, created_by)
  values (v_org, v.title, v.weekday, v.start_time, v.duration_minutes, v.valid_from, v.valid_until,
          v.format, v.capacity, v.location_id, v.court_id, v.travel_buffer_minutes, v.level, auth.uid())
  returning id into v.id;

  select occurrence_window_days into v_window from public.organizations where id = v_org;
  perform private.generate_occurrences(v_org, v_today, v_today + v_window);
  perform private.audit(v_org, 'series.create', 'recurring_slot', v.id, null, to_jsonb(v) - 'created_at');
  return v.id;
end;
$$;

-- Impacto de alterar a série a partir de uma data (sem gravar nada).
create or replace function public.preview_series_change(p_series_id uuid, p_effective_date date, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.recurring_slots;
  v_new public.recurring_slots;
  v_today date;
  v_students jsonb;
  v_student_conflicts text[];
  v_max int;
  v_regen int;
  v_kept int;
begin
  select * into v_old from public.recurring_slots where id = p_series_id;
  perform private.require_coach(v_old.organization_id);
  v_today := private.org_today(v_old.organization_id);
  v_new := private.parse_series_payload(v_old.organization_id, p_payload - 'valid_from', v_old);
  v_new.valid_from := p_effective_date;
  v_new.valid_until := v_old.valid_until;

  select coalesce(jsonb_agg(jsonb_build_object('student_id', s.id, 'name', s.full_name) order by s.full_name), '[]'::jsonb)
    into v_students
    from public.students s
   where s.id in (select e.student_id from public.enrollments e
                   where e.series_id = v_old.id and e.status = 'active'
                     and coalesce(e.valid_until, 'infinity'::date) >= p_effective_date);

  select array_agg(distinct sc.description) into v_student_conflicts
    from public.enrollments e
    cross join lateral private.student_conflicts(e.student_id, v_new.weekday, v_new.start_time, v_new.duration_minutes,
                                                 greatest(e.valid_from, p_effective_date), e.valid_until,
                                                 v_new.location_id, v_new.travel_buffer_minutes, v_old.series_root_id) sc
   where e.series_id = v_old.id and e.status = 'active'
     and coalesce(e.valid_until, 'infinity'::date) >= p_effective_date;

  v_max := private.max_enrolled(v_old.id, p_effective_date, v_old.valid_until);

  select count(*) filter (where not o.is_exception and o.status <> 'completed'
                           and not exists (select 1 from public.attendance a where a.occurrence_id = o.id)),
         count(*) filter (where o.is_exception)
    into v_regen, v_kept
    from public.lesson_occurrences o
   where o.series_root_id = v_old.series_root_id and o.original_date >= p_effective_date;

  return jsonb_build_object(
    'valid_effective_date', p_effective_date >= v_today and p_effective_date >= v_old.valid_from
                            and (v_old.valid_until is null or p_effective_date <= v_old.valid_until),
    'conflicts', to_jsonb(coalesce(private.series_conflict_list(v_new, v_old.series_root_id), '{}'::text[])),
    'student_conflicts', to_jsonb(coalesce(v_student_conflicts, '{}'::text[])),
    'affected_students', v_students,
    'max_enrolled', v_max,
    'new_capacity', v_new.capacity,
    'capacity_ok', v_max <= v_new.capacity,
    'occurrences_to_regenerate', v_regen,
    'exceptions_preserved', v_kept);
end;
$$;

create or replace function public.update_series_from(p_series_id uuid, p_effective_date date, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.recurring_slots;
  v_new public.recurring_slots;
  v_today date;
  v_window int;
  v_new_id uuid;
  v_students uuid[];
  v_conf text[];
  e record;
begin
  select * into v_old from public.recurring_slots where id = p_series_id for update;
  perform private.require_coach(v_old.organization_id);
  v_today := private.org_today(v_old.organization_id);

  if p_effective_date is null or p_effective_date < v_today then
    perform private.fail('CS422', 'Alterações valem a partir de hoje; aulas passadas não são reescritas.');
  end if;
  if p_effective_date < v_old.valid_from or (v_old.valid_until is not null and p_effective_date > v_old.valid_until) then
    perform private.fail('CS422', 'A data escolhida está fora da vigência deste horário.');
  end if;

  v_new := private.parse_series_payload(v_old.organization_id, p_payload - 'valid_from', v_old);
  v_new.valid_from := p_effective_date;
  if not (p_payload ? 'valid_until') then
    v_new.valid_until := v_old.valid_until;
  end if;

  perform private.lock_schedule(v_old.organization_id);
  perform private.fail_if_conflicts(private.series_conflict_list(v_new, v_old.series_root_id));

  if private.max_enrolled(v_old.id, p_effective_date, v_old.valid_until) > v_new.capacity then
    perform private.fail('CS409', 'A nova capacidade é menor que o número de alunos matriculados. Encerre matrículas antes.');
  end if;

  select array_agg(distinct sc.description) into v_conf
    from public.enrollments en
    cross join lateral private.student_conflicts(en.student_id, v_new.weekday, v_new.start_time, v_new.duration_minutes,
                                                 greatest(en.valid_from, p_effective_date),
                                                 least(en.valid_until, v_new.valid_until),
                                                 v_new.location_id, v_new.travel_buffer_minutes, v_old.series_root_id) sc
   where en.series_id = v_old.id and en.status = 'active'
     and coalesce(en.valid_until, 'infinity'::date) >= p_effective_date;
  perform private.fail_if_conflicts(v_conf);

  select array_agg(distinct en.student_id) into v_students
    from public.enrollments en
   where en.series_id = v_old.id and en.status = 'active'
     and coalesce(en.valid_until, 'infinity'::date) >= p_effective_date;

  if p_effective_date = v_old.valid_from then
    update public.recurring_slots set
      title = v_new.title, weekday = v_new.weekday, start_time = v_new.start_time,
      duration_minutes = v_new.duration_minutes, valid_until = v_new.valid_until, format = v_new.format,
      capacity = v_new.capacity, location_id = v_new.location_id, court_id = v_new.court_id,
      travel_buffer_minutes = v_new.travel_buffer_minutes, level = v_new.level
    where id = v_old.id;
    v_new_id := v_old.id;
    if v_new.valid_until is not null then
      update public.enrollments set valid_until = v_new.valid_until
       where series_id = v_old.id and status = 'active' and coalesce(valid_until, 'infinity'::date) > v_new.valid_until;
    end if;
  else
    update public.recurring_slots set valid_until = p_effective_date - 1 where id = v_old.id;
    insert into public.recurring_slots (organization_id, series_root_id, previous_version_id, title, weekday, start_time,
                                        duration_minutes, valid_from, valid_until, format, capacity, location_id, court_id,
                                        travel_buffer_minutes, level, created_by)
    values (v_old.organization_id, v_old.series_root_id, v_old.id, v_new.title, v_new.weekday, v_new.start_time,
            v_new.duration_minutes, p_effective_date, v_new.valid_until, v_new.format, v_new.capacity, v_new.location_id,
            v_new.court_id, v_new.travel_buffer_minutes, v_new.level, auth.uid())
    returning id into v_new_id;

    for e in select * from public.enrollments
              where series_id = v_old.id and status = 'active'
                and coalesce(valid_until, 'infinity'::date) >= p_effective_date
    loop
      if e.valid_from >= p_effective_date then
        update public.enrollments
           set series_id = v_new_id,
               valid_until = case when v_new.valid_until is not null and coalesce(e.valid_until, 'infinity'::date) > v_new.valid_until
                                  then v_new.valid_until else e.valid_until end
         where id = e.id;
      else
        update public.enrollments set valid_until = p_effective_date - 1 where id = e.id;
        insert into public.enrollments (organization_id, student_id, series_id, series_root_id, valid_from, valid_until,
                                        source, created_by)
        values (e.organization_id, e.student_id, v_new_id, v_old.series_root_id, p_effective_date,
                case when v_new.valid_until is not null and coalesce(e.valid_until, 'infinity'::date) > v_new.valid_until
                     then v_new.valid_until else e.valid_until end,
                'series_edit', auth.uid());
      end if;
    end loop;
  end if;

  -- Ocorrências futuras sem exceção e sem chamada são regeneradas; exceções
  -- (canceladas/remanejadas individualmente) e registros passados permanecem.
  delete from public.lesson_occurrences o
   where o.series_root_id = v_old.series_root_id
     and o.original_date >= p_effective_date
     and not o.is_exception
     and o.status <> 'completed'
     and not exists (select 1 from public.attendance a where a.occurrence_id = o.id);

  select occurrence_window_days into v_window from public.organizations where id = v_old.organization_id;
  perform private.generate_occurrences(v_old.organization_id, v_today, v_today + v_window);

  if v_students is not null then
    perform private.emit(v_old.organization_id, 'series_changed',
      jsonb_build_object('series_id', v_new_id, 'student_ids', to_jsonb(v_students), 'effective_date', p_effective_date),
      format('series_changed:%s:%s', v_new_id, extract(epoch from clock_timestamp())));
  end if;
  perform private.audit(v_old.organization_id, 'series.update', 'recurring_slot', v_new_id, null,
    jsonb_build_object('effective_date', p_effective_date, 'previous_version', v_old.id,
                       'before', to_jsonb(v_old) - 'created_at', 'after', to_jsonb(v_new) - 'created_at' - 'id'));
  return v_new_id;
end;
$$;

create or replace function public.end_series(p_series_id uuid, p_last_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.recurring_slots;
  v_today date;
  v_students uuid[];
  o record;
begin
  select * into v from public.recurring_slots where id = p_series_id for update;
  perform private.require_coach(v.organization_id);
  v_today := private.org_today(v.organization_id);
  if private.clean_text(p_reason, 300) is null then
    perform private.fail('CS422', 'Informe o motivo do encerramento.');
  end if;
  if p_last_date is null or p_last_date < v_today - 1 or p_last_date < v.valid_from then
    perform private.fail('CS422', 'A última data precisa ser a partir de ontem e dentro da vigência.');
  end if;
  if v.valid_until is not null and p_last_date >= v.valid_until then
    perform private.fail('CS422', 'O horário já termina nesta data ou antes.');
  end if;
  if exists (select 1 from public.recurring_slots where series_root_id = v.series_root_id and valid_from > v.valid_from) then
    perform private.fail('CS409', 'Existe uma versão futura deste horário; encerre a versão mais recente.');
  end if;
  perform private.lock_schedule(v.organization_id);

  select array_agg(distinct student_id) into v_students
    from public.enrollments
   where series_id = v.id and status = 'active' and coalesce(valid_until, 'infinity'::date) > p_last_date;

  update public.enrollments set status = 'cancelled', ended_by = auth.uid(), ended_at = now(), end_reason = p_reason
   where series_id = v.id and status = 'active' and valid_from > p_last_date;
  update public.enrollments set valid_until = p_last_date, ended_by = auth.uid(), ended_at = now(), end_reason = p_reason
   where series_id = v.id and status = 'active' and coalesce(valid_until, 'infinity'::date) > p_last_date;
  update public.recurring_slots set valid_until = p_last_date where id = v.id;

  update public.enrollment_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
         decision_reason = 'Horário encerrado'
   where series_root_id = v.series_root_id and status = 'pending';

  delete from public.lesson_occurrences lo
   where lo.series_root_id = v.series_root_id and lo.original_date > p_last_date
     and not lo.is_exception and lo.status = 'scheduled'
     and not exists (select 1 from public.attendance a where a.occurrence_id = lo.id);
  for o in select id from public.lesson_occurrences
            where series_root_id = v.series_root_id and original_date > p_last_date and status = 'scheduled'
  loop
    update public.lesson_occurrences set status = 'cancelled', cancel_reason = 'Horário encerrado',
           cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now() where id = o.id;
  end loop;

  if v_students is not null then
    perform private.emit(v.organization_id, 'enrollment_ended',
      jsonb_build_object('series_id', v.id, 'student_ids', to_jsonb(v_students)),
      format('series_ended:%s', v.id));
  end if;
  perform private.audit(v.organization_id, 'series.end', 'recurring_slot', v.id, null,
    jsonb_build_object('last_date', p_last_date, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Matrículas
-- -----------------------------------------------------------------------------
-- Matricula o aluno na linhagem da série a partir de p_from (até p_until),
-- criando um segmento por versão. Revalida capacidade e conflitos com lock.
create or replace function private.enroll_lineage(
  p_student public.students, p_root uuid, p_from date, p_until date,
  p_source public.enrollment_source, p_request uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first uuid;
  v_id uuid;
  s record;
  v_seg_from date;
  v_seg_until date;
  v_conf text[];
  v_found boolean := false;
begin
  perform private.lock_schedule(p_student.organization_id);

  if p_student.status <> 'active' or p_student.anonymized_at is not null then
    perform private.fail('CS422', 'Somente alunos ativos podem ser matriculados.');
  end if;
  if exists (select 1 from public.enrollments
              where student_id = p_student.id and series_root_id = p_root and status = 'active'
                and daterange(valid_from, valid_until, '[]') && daterange(p_from, p_until, '[]')) then
    perform private.fail('CS409', 'O aluno já está matriculado neste horário no período.');
  end if;

  for s in select * from public.recurring_slots
            where series_root_id = p_root and organization_id = p_student.organization_id
              and coalesce(valid_until, 'infinity'::date) >= p_from
              and (p_until is null or valid_from <= p_until)
            order by valid_from
            for update
  loop
    v_found := true;
    v_seg_from := greatest(p_from, s.valid_from);
    v_seg_until := case
      when s.valid_until is null then p_until
      when p_until is null then s.valid_until
      else least(p_until, s.valid_until) end;

    if private.max_enrolled(s.id, v_seg_from, v_seg_until) + 1 > s.capacity then
      perform private.fail('CS409', format('Horário de %s às %s sem vagas no período.',
                                            private.weekday_label(s.weekday), to_char(s.start_time, 'HH24:MI')));
    end if;
    select array_agg(distinct c.description) into v_conf
      from private.student_conflicts(p_student.id, s.weekday, s.start_time, s.duration_minutes, v_seg_from, v_seg_until,
                                     s.location_id, s.travel_buffer_minutes, p_root) c;
    perform private.fail_if_conflicts(v_conf);

    insert into public.enrollments (organization_id, student_id, series_id, series_root_id, valid_from, valid_until,
                                    source, request_id, created_by)
    values (p_student.organization_id, p_student.id, s.id, p_root, v_seg_from, v_seg_until, p_source, p_request, auth.uid())
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
  end loop;

  if not v_found then
    perform private.fail('CS422', 'Horário inexistente ou encerrado para o período escolhido.');
  end if;
  perform private.audit(p_student.organization_id, 'enrollment.create', 'enrollment', v_first, p_student.id,
    jsonb_build_object('series_root_id', p_root, 'valid_from', p_from, 'valid_until', p_until, 'source', p_source));
  return v_first;
end;
$$;

create or replace function public.create_enrollment(p_student_id uuid, p_series_id uuid, p_valid_from date, p_valid_until date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students := private.coach_student(p_student_id);
  v_series public.recurring_slots;
  v_today date := private.org_today(v_student.organization_id);
  v_id uuid;
begin
  select * into v_series from public.recurring_slots where id = p_series_id and organization_id = v_student.organization_id;
  if v_series.id is null then
    perform private.fail('CS404', 'Horário não encontrado.');
  end if;
  if p_valid_from is null or p_valid_from < v_today - 60 then
    perform private.fail('CS422', 'Início da matrícula inválido (no máximo 60 dias no passado).');
  end if;
  if p_valid_until is not null and p_valid_until < p_valid_from then
    perform private.fail('CS422', 'Fim da matrícula anterior ao início.');
  end if;
  v_id := private.enroll_lineage(v_student, v_series.series_root_id, p_valid_from, p_valid_until, 'direct', null);
  perform private.emit(v_student.organization_id, 'enrollment_created',
    jsonb_build_object('enrollment_id', v_id, 'student_id', v_student.id), 'enrollment_created:' || v_id::text);
  return v_id;
end;
$$;

create or replace function public.end_enrollment(p_enrollment_id uuid, p_last_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.enrollments;
  v_today date;
begin
  select * into v from public.enrollments where id = p_enrollment_id;
  perform private.require_coach(v.organization_id);
  v_today := private.org_today(v.organization_id);
  if private.clean_text(p_reason, 300) is null then
    perform private.fail('CS422', 'Informe o motivo.');
  end if;
  if p_last_date is null or p_last_date < v_today - 60 then
    perform private.fail('CS422', 'Data final inválida.');
  end if;
  perform private.lock_schedule(v.organization_id);
  if exists (select 1 from public.attendance a
               join public.lesson_occurrences o on o.id = a.occurrence_id
              where a.student_id = v.student_id and o.series_root_id = v.series_root_id and o.original_date > p_last_date) then
    perform private.fail('CS409', 'Há presenças registradas depois desta data; escolha uma data posterior.');
  end if;

  update public.enrollments set status = 'cancelled', ended_by = auth.uid(), ended_at = now(), end_reason = p_reason
   where student_id = v.student_id and series_root_id = v.series_root_id and status = 'active' and valid_from > p_last_date;
  update public.enrollments set valid_until = p_last_date, ended_by = auth.uid(), ended_at = now(), end_reason = p_reason
   where student_id = v.student_id and series_root_id = v.series_root_id and status = 'active'
     and coalesce(valid_until, 'infinity'::date) > p_last_date;

  perform private.emit(v.organization_id, 'enrollment_ended',
    jsonb_build_object('enrollment_id', v.id, 'student_id', v.student_id),
    format('enrollment_ended:%s:%s', v.id, p_last_date));
  perform private.audit(v.organization_id, 'enrollment.end', 'enrollment', v.id, v.student_id,
    jsonb_build_object('last_date', p_last_date, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Disponibilidade e pedidos de vaga (aluno/responsável)
-- -----------------------------------------------------------------------------
create or replace function public.list_available_slots(p_student_id uuid)
returns table (
  series_id uuid, title text, weekday int, start_time time, duration_minutes int, format public.lesson_format,
  capacity int, free_spots int, level text, location_name text, location_address text, court_name text,
  next_date date, already_enrolled boolean, pending_request boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_today date;
begin
  perform private.require_module_access(p_student_id);
  select * into v_student from public.students where id = p_student_id;
  v_today := private.org_today(v_student.organization_id);
  return query
    select s.id, s.title, s.weekday::int, s.start_time, s.duration_minutes, s.format, s.capacity::int,
           greatest(s.capacity - private.max_enrolled(s.id, greatest(v_today, s.valid_from), s.valid_until), 0)::int,
           s.level, l.name, l.address, c.name,
           private.next_weekday_date(greatest(v_today, s.valid_from), s.weekday),
           exists (select 1 from public.enrollments e where e.student_id = p_student_id and e.series_root_id = s.series_root_id
                     and e.status = 'active' and coalesce(e.valid_until, 'infinity'::date) >= v_today),
           exists (select 1 from public.enrollment_requests r where r.student_id = p_student_id
                     and r.series_root_id = s.series_root_id and r.status = 'pending')
      from public.recurring_slots s
      join public.locations l on l.id = s.location_id and l.active
      left join public.courts c on c.id = s.court_id
     where s.organization_id = v_student.organization_id
       and coalesce(s.valid_until, 'infinity'::date) >= v_today
       and s.valid_from <= v_today + 60
       -- Mostra apenas a versão vigente (ou a primeira futura) de cada linhagem.
       and not exists (select 1 from public.recurring_slots pv
                        where pv.series_root_id = s.series_root_id and pv.valid_from < s.valid_from
                          and coalesce(pv.valid_until, 'infinity'::date) >= v_today)
     order by s.weekday, s.start_time;
end;
$$;

create or replace function public.request_enrollment(p_student_id uuid, p_series_id uuid, p_desired_start date default null, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_series public.recurring_slots;
  v_today date;
  v_start date;
  v_level text;
  v_id uuid;
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  perform private.require_module_access(p_student_id);
  v_level := private.restriction_level(p_student_id);
  if v_level in ('block_requests', 'restrict_modules') then
    perform private.fail('CS423', 'Novos pedidos de vaga estão bloqueados por pendência financeira. Regularize na área Financeiro.');
  end if;
  perform private.enforce_rate_limit('enroll_request:' || auth.uid()::text, 20, 86400);

  select * into v_student from public.students where id = p_student_id;
  if v_student.status <> 'active' then
    perform private.fail('CS422', 'Cadastro pausado ou arquivado; fale com o professor.');
  end if;
  v_today := private.org_today(v_student.organization_id);

  select * into v_series from public.recurring_slots
   where id = p_series_id and organization_id = v_student.organization_id
     and coalesce(valid_until, 'infinity'::date) >= v_today;
  if v_series.id is null then
    perform private.fail('CS404', 'Horário não encontrado.');
  end if;

  v_start := coalesce(p_desired_start, private.next_weekday_date(greatest(v_today, v_series.valid_from), v_series.weekday));
  if v_start < v_today or v_start < v_series.valid_from
     or (v_series.valid_until is not null and v_start > v_series.valid_until) then
    perform private.fail('CS422', 'Data de início inválida para este horário.');
  end if;
  if exists (select 1 from public.enrollments e where e.student_id = p_student_id and e.series_root_id = v_series.series_root_id
               and e.status = 'active' and coalesce(e.valid_until, 'infinity'::date) >= v_start) then
    perform private.fail('CS409', 'Você já tem vaga fixa neste horário.');
  end if;
  if private.max_enrolled(v_series.id, v_start, v_series.valid_until) >= v_series.capacity then
    perform private.fail('CS409', 'Este horário não tem vagas no momento.');
  end if;

  insert into public.enrollment_requests (organization_id, student_id, series_id, series_root_id, desired_start, message, requested_by)
  values (v_student.organization_id, p_student_id, v_series.id, v_series.series_root_id, v_start,
          private.clean_text(p_message, 500), auth.uid())
  returning id into v_id;

  perform private.audit(v_student.organization_id, 'enrollment_request.create', 'enrollment_request', v_id, p_student_id,
    jsonb_build_object('series_id', v_series.id, 'desired_start', v_start));
  perform private.emit(v_student.organization_id, 'enrollment_request_created',
    jsonb_build_object('request_id', v_id, 'student_id', p_student_id), 'enrollment_request_created:' || v_id::text);
  return v_id;
exception
  when unique_violation then
    perform private.fail('CS409', 'Já existe um pedido pendente para este horário.');
end;
$$;

create or replace function public.cancel_enrollment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.enrollment_requests;
begin
  select * into v from public.enrollment_requests where id = p_request_id for update;
  if v.id is null or not private.can_access_student(v.student_id) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if v.status <> 'pending' then
    perform private.fail('CS409', 'Somente pedidos pendentes podem ser cancelados.');
  end if;
  update public.enrollment_requests set status = 'cancelled', decided_at = now(), decided_by = auth.uid(),
         decision_reason = 'Cancelado pelo solicitante'
   where id = v.id;
  perform private.audit(v.organization_id, 'enrollment_request.cancel', 'enrollment_request', v.id, v.student_id, '{}'::jsonb);
end;
$$;

create or replace function public.decide_enrollment_request(
  p_request_id uuid, p_approve boolean, p_reason text default null, p_valid_from date default null,
  p_override_restriction boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.enrollment_requests;
  v_student public.students;
  v_today date;
  v_from date;
  v_enrollment uuid;
  v_level text;
begin
  select * into v from public.enrollment_requests where id = p_request_id for update;
  perform private.require_coach(v.organization_id);

  if v.status <> 'pending' then
    if v.status = 'approved' and p_approve then
      return v.enrollment_id; -- idempotente
    end if;
    perform private.fail('CS409', 'Este pedido já foi decidido.');
  end if;

  if not p_approve then
    if private.clean_text(p_reason, 500) is null then
      perform private.fail('CS422', 'Informe o motivo da recusa.');
    end if;
    update public.enrollment_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
           decision_reason = private.clean_text(p_reason, 500)
     where id = v.id;
  else
    select * into v_student from public.students where id = v.student_id for update;
    v_today := private.org_today(v.organization_id);
    v_from := coalesce(p_valid_from, greatest(v.desired_start, v_today));
    if v_from < v_today then
      perform private.fail('CS422', 'O início da vaga não pode ser no passado.');
    end if;
    v_level := private.restriction_level(v.student_id);
    if v_level in ('block_requests', 'restrict_modules') and not coalesce(p_override_restriction, false) then
      perform private.fail('CS423', 'Aluno com restrição financeira ativa. Libere o acesso ou confirme a aprovação mesmo assim.');
    end if;
    v_enrollment := private.enroll_lineage(v_student, v.series_root_id, v_from, null, 'request', v.id);
    update public.enrollment_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(),
           decision_reason = private.clean_text(p_reason, 500), enrollment_id = v_enrollment
     where id = v.id;
  end if;

  perform private.audit(v.organization_id, 'enrollment_request.decide', 'enrollment_request', v.id, v.student_id,
    jsonb_build_object('approved', p_approve, 'override_restriction', coalesce(p_override_restriction, false),
                       'restriction_level', v_level, 'reason', p_reason));
  perform private.emit(v.organization_id, 'enrollment_request_decided',
    jsonb_build_object('request_id', v.id, 'student_id', v.student_id, 'approved', p_approve),
    'enrollment_request_decided:' || v.id::text);
  return v_enrollment;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ocorrências individuais
-- -----------------------------------------------------------------------------
create or replace function public.update_occurrence(p_occurrence_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lesson_occurrences;
  v_tz text;
  v_today date;
  v_date date;
  v_start time;
  v_dur int;
  v_loc uuid;
  v_court uuid;
  v_roster uuid[];
  v_conf text[];
begin
  select * into v from public.lesson_occurrences where id = p_occurrence_id for update;
  perform private.require_coach(v.organization_id);
  v_tz := private.org_timezone(v.organization_id);
  v_today := private.org_today(v.organization_id);
  if v.status <> 'scheduled' or v.starts_at <= now() then
    perform private.fail('CS409', 'Somente aulas futuras e programadas podem ser remarcadas.');
  end if;
  begin
    v_date := coalesce((p_payload ->> 'local_date')::date, v.local_date);
    v_start := coalesce((p_payload ->> 'start_time')::time, v.start_time);
    v_dur := coalesce((p_payload ->> 'duration_minutes')::int, v.duration_minutes);
    v_loc := coalesce((p_payload ->> 'location_id')::uuid, v.location_id);
    v_court := case when p_payload ? 'court_id' then nullif(p_payload ->> 'court_id', '')::uuid else v.court_id end;
  exception when others then
    perform private.fail('CS422', 'Dados inválidos.');
  end;
  if v_date < v_today or private.local_instant(v_date, v_start, v_tz) <= now() then
    perform private.fail('CS422', 'A nova data/hora precisa ser futura.');
  end if;
  if v_dur < 15 or v_dur > 300 or private.minutes_of(v_start) + v_dur > 1440 then
    perform private.fail('CS422', 'Duração inválida.');
  end if;
  if not exists (select 1 from public.locations where id = v_loc and organization_id = v.organization_id and active) then
    perform private.fail('CS422', 'Local inválido.');
  end if;
  if v_court is not null and not exists (select 1 from public.courts where id = v_court and location_id = v_loc and active) then
    perform private.fail('CS422', 'Quadra inválida para o local.');
  end if;

  perform private.lock_schedule(v.organization_id);
  select array_agg(r) into v_roster from private.occurrence_roster(v.id) r;
  select array_agg(distinct c.description) into v_conf
    from private.concrete_conflicts(v.organization_id, v_date, v_start, v_dur, v_loc, v_court, v.travel_buffer_minutes,
                                    v.id, coalesce(v_roster, '{}'::uuid[])) c;
  perform private.fail_if_conflicts(v_conf);

  update public.lesson_occurrences set
    local_date = v_date, start_time = v_start, duration_minutes = v_dur,
    starts_at = private.local_instant(v_date, v_start, v_tz),
    ends_at = private.local_instant(v_date, v_start, v_tz) + make_interval(mins => v_dur),
    location_id = v_loc, court_id = v_court, is_exception = true,
    exception_note = private.clean_text(p_payload ->> 'note', 300),
    updated_at = now(), updated_by = auth.uid()
  where id = v.id;

  if v_roster is not null then
    perform private.emit(v.organization_id, 'occurrence_changed',
      jsonb_build_object('occurrence_id', v.id, 'student_ids', to_jsonb(v_roster)),
      format('occurrence_changed:%s:%s', v.id, extract(epoch from clock_timestamp())));
  end if;
  perform private.audit(v.organization_id, 'occurrence.update', 'lesson_occurrence', v.id, null,
    jsonb_build_object('before', jsonb_build_object('date', v.local_date, 'start', v.start_time, 'location', v.location_id, 'court', v.court_id),
                       'after', jsonb_build_object('date', v_date, 'start', v_start, 'location', v_loc, 'court', v_court)));
end;
$$;

create or replace function public.cancel_occurrence(p_occurrence_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lesson_occurrences;
  v_roster uuid[];
  v_reason text := private.clean_text(p_reason, 300);
begin
  select * into v from public.lesson_occurrences where id = p_occurrence_id for update;
  perform private.require_coach(v.organization_id);
  if v_reason is null then
    perform private.fail('CS422', 'Informe o motivo do cancelamento.');
  end if;
  if v.status <> 'scheduled' then
    perform private.fail('CS409', 'Esta aula não está programada.');
  end if;
  if exists (select 1 from public.attendance where occurrence_id = v.id) then
    perform private.fail('CS409', 'A aula já tem chamada registrada.');
  end if;
  update public.lesson_occurrences set status = 'cancelled', is_exception = true, cancel_reason = v_reason,
         cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now(), updated_by = auth.uid()
   where id = v.id;
  select array_agg(r) into v_roster from private.occurrence_roster(v.id) r;
  if v_roster is not null then
    perform private.emit(v.organization_id, 'occurrence_cancelled',
      jsonb_build_object('occurrence_id', v.id, 'student_ids', to_jsonb(v_roster)), 'occurrence_cancelled:' || v.id::text);
  end if;
  perform private.audit(v.organization_id, 'occurrence.cancel', 'lesson_occurrence', v.id, null,
    jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.restore_occurrence(p_occurrence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lesson_occurrences;
  v_roster uuid[];
  v_conf text[];
begin
  select * into v from public.lesson_occurrences where id = p_occurrence_id for update;
  perform private.require_coach(v.organization_id);
  if v.status <> 'cancelled' or v.starts_at <= now() then
    perform private.fail('CS409', 'Somente aulas futuras canceladas podem ser reativadas.');
  end if;
  perform private.lock_schedule(v.organization_id);
  select array_agg(r) into v_roster from private.occurrence_roster(v.id) r;
  select array_agg(distinct c.description) into v_conf
    from private.concrete_conflicts(v.organization_id, v.local_date, v.start_time, v.duration_minutes, v.location_id,
                                    v.court_id, v.travel_buffer_minutes, v.id, coalesce(v_roster, '{}'::uuid[])) c;
  perform private.fail_if_conflicts(v_conf);
  update public.lesson_occurrences set status = 'scheduled', cancel_reason = null, cancelled_by = null, cancelled_at = null,
         updated_at = now(), updated_by = auth.uid()
   where id = v.id;
  if v_roster is not null then
    perform private.emit(v.organization_id, 'occurrence_changed',
      jsonb_build_object('occurrence_id', v.id, 'student_ids', to_jsonb(v_roster)),
      format('occurrence_restored:%s:%s', v.id, extract(epoch from clock_timestamp())));
  end if;
  perform private.audit(v.organization_id, 'occurrence.restore', 'lesson_occurrence', v.id, null, '{}'::jsonb);
end;
$$;

create or replace function public.create_unavailability(p_starts_on date, p_ends_on date, p_location_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_id uuid;
  v_reason text := private.clean_text(p_reason, 200);
  o record;
  v_roster uuid[];
begin
  if v_reason is null or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    perform private.fail('CS422', 'Informe período e motivo válidos.');
  end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and organization_id = v_org) then
    perform private.fail('CS422', 'Local inválido.');
  end if;
  perform private.lock_schedule(v_org);
  insert into public.unavailability_periods (organization_id, location_id, starts_on, ends_on, reason, created_by)
  values (v_org, p_location_id, p_starts_on, p_ends_on, v_reason, auth.uid())
  returning id into v_id;

  for o in select * from public.lesson_occurrences
            where organization_id = v_org and status = 'scheduled'
              and local_date between p_starts_on and p_ends_on
              and starts_at > now()
              and (p_location_id is null or location_id = p_location_id)
              and not exists (select 1 from public.attendance a where a.occurrence_id = lesson_occurrences.id)
  loop
    update public.lesson_occurrences set status = 'cancelled', is_exception = true, cancel_reason = v_reason,
           cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
     where id = o.id;
    select array_agg(r) into v_roster from private.occurrence_roster(o.id) r;
    if v_roster is not null then
      perform private.emit(v_org, 'occurrence_cancelled',
        jsonb_build_object('occurrence_id', o.id, 'student_ids', to_jsonb(v_roster)), 'occurrence_cancelled:' || o.id::text);
    end if;
  end loop;
  perform private.audit(v_org, 'unavailability.create', 'unavailability_period', v_id, null,
    jsonb_build_object('starts_on', p_starts_on, 'ends_on', p_ends_on, 'location_id', p_location_id, 'reason', v_reason));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Chamada
-- -----------------------------------------------------------------------------
create or replace function public.save_attendance(p_occurrence_id uuid, p_marks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lesson_occurrences;
  v_roster uuid[];
  m jsonb;
  v_student uuid;
  v_status public.attendance_status;
  v_existing public.attendance;
  v_changes int := 0;
begin
  select * into v from public.lesson_occurrences where id = p_occurrence_id for update;
  perform private.require_coach(v.organization_id);
  if v.status = 'cancelled' then
    perform private.fail('CS409', 'Aula cancelada não tem chamada.');
  end if;
  if v.starts_at > now() + interval '30 minutes' then
    perform private.fail('CS409', 'A chamada fica disponível a partir de 30 minutos antes do início da aula.');
  end if;
  if jsonb_typeof(p_marks) <> 'array' then
    perform private.fail('CS422', 'Formato de chamada inválido.');
  end if;
  select array_agg(r) into v_roster from private.occurrence_roster(v.id) r;

  for m in select value from jsonb_array_elements(p_marks) loop
    begin
      v_student := (m ->> 'student_id')::uuid;
      v_status := nullif(m ->> 'status', '')::public.attendance_status;
    exception when others then
      perform private.fail('CS422', 'Marcação inválida.');
    end;
    if v_roster is null or not (v_student = any (v_roster)) then
      perform private.fail('CS422', 'Aluno não pertence a esta aula.');
    end if;
    select * into v_existing from public.attendance where occurrence_id = v.id and student_id = v_student for update;
    if v_status is null then
      if v_existing.id is not null then
        delete from public.attendance where id = v_existing.id;
        v_changes := v_changes + 1;
        perform private.audit(v.organization_id, 'attendance.clear', 'attendance', v_existing.id, v_student,
          jsonb_build_object('occurrence_id', v.id, 'from', v_existing.status, 'to', null));
      end if;
    elsif v_existing.id is null then
      insert into public.attendance (organization_id, occurrence_id, student_id, status, marked_by, updated_by)
      values (v.organization_id, v.id, v_student, v_status, auth.uid(), auth.uid());
      v_changes := v_changes + 1;
      perform private.audit(v.organization_id, 'attendance.mark', 'attendance', v.id, v_student,
        jsonb_build_object('occurrence_id', v.id, 'from', null, 'to', v_status));
    elsif v_existing.status <> v_status then
      update public.attendance set status = v_status, updated_by = auth.uid(), updated_at = now() where id = v_existing.id;
      v_changes := v_changes + 1;
      perform private.audit(v.organization_id, 'attendance.change', 'attendance', v_existing.id, v_student,
        jsonb_build_object('occurrence_id', v.id, 'from', v_existing.status, 'to', v_status));
    end if;
  end loop;

  if v.status = 'scheduled' then
    update public.lesson_occurrences set status = 'completed', completed_at = now(), completed_by = auth.uid(), updated_at = now()
     where id = v.id;
  end if;
  return jsonb_build_object('changes', v_changes);
end;
$$;

create or replace function public.occurrence_attendance(p_occurrence_id uuid)
returns table (student_id uuid, full_name text, status public.attendance_status, marked_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.lesson_occurrences where id = p_occurrence_id;
  perform private.require_coach(v_org);
  return query
    select s.id, s.full_name, a.status, a.marked_at, a.updated_at
      from public.students s
      left join public.attendance a on a.occurrence_id = p_occurrence_id and a.student_id = s.id
     where s.id in (select private.occurrence_roster(p_occurrence_id))
        or a.id is not null
     order by s.full_name;
end;
$$;

-- Frequência: presentes ÷ (presentes + faltas + faltas justificadas) em aulas
-- concluídas. Canceladas e futuras não entram. "Não informado" = aula
-- concluída em que o aluno estava matriculado e não recebeu marcação.
create or replace function public.attendance_summary(p_student_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_present int;
  v_absent int;
  v_excused int;
  v_not_recorded int;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if not private.is_coach_of(v_org) then
    perform private.require_module_access(p_student_id);
  end if;

  select count(*) filter (where a.status = 'present'),
         count(*) filter (where a.status = 'absent'),
         count(*) filter (where a.status = 'excused')
    into v_present, v_absent, v_excused
    from public.attendance a
    join public.lesson_occurrences o on o.id = a.occurrence_id
   where a.student_id = p_student_id and o.status = 'completed'
     and o.local_date between p_from and p_to;

  select count(*) into v_not_recorded
    from public.lesson_occurrences o
    join public.enrollments e on e.series_root_id = o.series_root_id and e.student_id = p_student_id and e.status = 'active'
     and o.original_date between e.valid_from and coalesce(e.valid_until, 'infinity'::date)
   where o.status = 'completed' and o.local_date between p_from and p_to
     and not exists (select 1 from public.attendance a where a.occurrence_id = o.id and a.student_id = p_student_id);

  return jsonb_build_object(
    'present', v_present, 'absent', v_absent, 'excused', v_excused, 'not_recorded', v_not_recorded,
    'marked', v_present + v_absent + v_excused,
    'rate', case when v_present + v_absent + v_excused = 0 then null
                 else round(v_present::numeric * 100 / (v_present + v_absent + v_excused), 1) end);
end;
$$;

-- Agenda do professor (com contagem de matriculados, sem dados sensíveis extras).
create or replace function public.coach_agenda(p_from date, p_to date)
returns table (
  occurrence_id uuid, series_id uuid, series_root_id uuid, title text, local_date date, start_time time,
  duration_minutes int, starts_at timestamptz, status public.occurrence_status, is_exception boolean,
  format public.lesson_format, capacity int, enrolled int, marked int,
  location_id uuid, location_name text, court_name text, cancel_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
begin
  if p_to < p_from or p_to - p_from > 62 then
    perform private.fail('CS422', 'Período inválido (máximo de 62 dias).');
  end if;
  return query
    select o.id, o.series_id, o.series_root_id, s.title, o.local_date, o.start_time, o.duration_minutes, o.starts_at,
           o.status, o.is_exception, o.format, o.capacity::int,
           (select count(*)::int from private.occurrence_roster(o.id)),
           (select count(*)::int from public.attendance a where a.occurrence_id = o.id),
           o.location_id, l.name, c.name, o.cancel_reason
      from public.lesson_occurrences o
      join public.recurring_slots s on s.id = o.series_id
      join public.locations l on l.id = o.location_id
      left join public.courts c on c.id = o.court_id
     where o.organization_id = v_org and o.local_date between p_from and p_to
     order by o.starts_at;
end;
$$;

-- Aulas do aluno (somente as que ele frequenta; sem nomes de colegas).
create or replace function public.student_lessons(p_student_id uuid, p_from date, p_to date)
returns table (
  occurrence_id uuid, title text, local_date date, start_time time, duration_minutes int, starts_at timestamptz,
  status public.occurrence_status, cancel_reason text, is_exception boolean, exception_note text,
  format public.lesson_format, location_name text, location_address text, location_instructions text,
  court_name text, attendance public.attendance_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_coach_of((select organization_id from public.students where id = p_student_id)) then
    perform private.require_module_access(p_student_id);
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    perform private.fail('CS422', 'Período inválido.');
  end if;
  return query
    select o.id, s.title, o.local_date, o.start_time, o.duration_minutes, o.starts_at, o.status, o.cancel_reason,
           o.is_exception, o.exception_note, o.format, l.name, l.address, l.instructions, c.name, a.status
      from public.lesson_occurrences o
      join public.recurring_slots s on s.id = o.series_id
      join public.locations l on l.id = o.location_id
      left join public.courts c on c.id = o.court_id
      left join public.attendance a on a.occurrence_id = o.id and a.student_id = p_student_id
     where o.local_date between p_from and p_to
       and (exists (select 1 from public.enrollments e
                     where e.student_id = p_student_id and e.series_root_id = o.series_root_id and e.status = 'active'
                       and o.original_date between e.valid_from and coalesce(e.valid_until, 'infinity'::date))
            or a.id is not null)
     order by o.starts_at;
end;
$$;
