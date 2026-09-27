-- =============================================================================
-- Jobs agendados (pg_cron dentro do Postgres: não dependem de alguém abrir o
-- app). Todos idempotentes, com lock contra execução concorrente e registro em
-- private.job_runs para monitoramento.
-- =============================================================================

create extension if not exists pg_cron;

create or replace function private.apply_status_changes(p_org uuid, p_today date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.students s
     set status = c.status, status_effective_date = c.effective_date, updated_at = now()
    from (select distinct on (student_id) student_id, status, effective_date
            from public.student_status_changes
           where organization_id = p_org and effective_date <= p_today
           order by student_id, effective_date desc, created_at desc) c
   where s.id = c.student_id and s.organization_id = p_org and s.status is distinct from c.status;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function private.daily_maintenance(p_org uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window int;
  v_due_soon int;
  v_status int;
  v_occ int;
  v_inv int;
  v_events int := 0;
  r record;
begin
  select occurrence_window_days, due_soon_days into v_window, v_due_soon from public.organizations where id = p_org;
  v_status := private.apply_status_changes(p_org, p_today);
  v_occ := private.generate_occurrences(p_org, p_today, p_today + v_window);
  v_inv := private.run_invoice_generation(p_org, p_today);

  for r in select id, student_id, due_date from public.invoices
            where organization_id = p_org and status in ('open', 'under_review')
              and due_date between p_today and p_today + v_due_soon
  loop
    perform private.emit(p_org, 'invoice_due_soon', jsonb_build_object('invoice_id', r.id, 'student_id', r.student_id),
                         'invoice_due_soon:' || r.id::text);
    v_events := v_events + 1;
  end loop;
  for r in select id, student_id from public.invoices
            where organization_id = p_org and status in ('open', 'under_review') and due_date < p_today
  loop
    perform private.emit(p_org, 'invoice_overdue', jsonb_build_object('invoice_id', r.id, 'student_id', r.student_id),
                         'invoice_overdue:' || r.id::text);
    v_events := v_events + 1;
  end loop;

  -- Atualiza indicadores de restrição (avisos). Autorização não depende disto.
  for r in select distinct s.id
             from public.students s
            where s.organization_id = p_org
              and (exists (select 1 from public.invoices i where i.student_id = s.id and i.status in ('open', 'under_review'))
                   or exists (select 1 from private.restriction_states rs where rs.student_id = s.id and rs.level <> 'none')
                   or exists (select 1 from public.access_overrides o where o.student_id = s.id
                                and o.created_at > now() - interval '120 days'))
  loop
    perform private.refresh_restriction_state(r.id);
  end loop;

  return jsonb_build_object('status_changes', v_status, 'occurrences', v_occ, 'invoices', v_inv, 'finance_events', v_events);
end;
$$;

create or replace function private.lesson_reminders(p_org uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours int;
  v_count int := 0;
  r record;
  v_roster uuid[];
begin
  select lesson_reminder_hours into v_hours from public.organizations where id = p_org;
  for r in select id from public.lesson_occurrences
            where organization_id = p_org and status = 'scheduled'
              and starts_at > now() and starts_at <= now() + make_interval(hours => v_hours)
  loop
    select array_agg(x) into v_roster from private.occurrence_roster(r.id) x;
    if v_roster is not null then
      perform private.emit(p_org, 'lesson_reminder',
        jsonb_build_object('occurrence_id', r.id, 'student_ids', to_jsonb(v_roster)), 'lesson_reminder:' || r.id::text);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function private.run_job(p_job text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run bigint;
  v_details jsonb := '{}'::jsonb;
  o record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('job:' || p_job, 0)) then
    return jsonb_build_object('skipped', 'already_running');
  end if;
  insert into private.job_runs (job_name) values (p_job) returning id into v_run;
  begin
    if p_job = 'daily' then
      for o in select id from public.organizations loop
        v_details := v_details || jsonb_build_object(o.id::text, private.daily_maintenance(o.id, private.org_today(o.id)));
      end loop;
      delete from private.rate_limits where window_start < now() - interval '2 days';
      delete from private.job_runs where started_at < now() - interval '30 days';
      delete from private.outbox_events where status = 'done' and processed_at < now() - interval '90 days';
    elsif p_job = 'frequent' then
      for o in select id from public.organizations loop
        perform private.lesson_reminders(o.id);
      end loop;
      v_details := jsonb_build_object('outbox_processed', private.process_outbox(500));
    else
      raise exception 'Job desconhecido: %', p_job;
    end if;
    update private.job_runs set status = 'succeeded', finished_at = clock_timestamp(), details = v_details where id = v_run;
  exception when others then
    update private.job_runs set status = 'failed', finished_at = clock_timestamp(), error = left(sqlerrm, 1000) where id = v_run;
  end;
  return v_details;
end;
$$;

-- Disparo manual/externo (ex.: cron do provedor de hospedagem como redundância).
create or replace function public.run_jobs_now(p_job text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job not in ('daily', 'frequent') then
    perform private.fail('CS422', 'Job inválido.');
  end if;
  return private.run_job(p_job);
end;
$$;

-- Saúde operacional para o professor (sem dados pessoais).
create or replace function public.job_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
begin
  return jsonb_build_object(
    'jobs', (select coalesce(jsonb_agg(x), '[]') from (
      select distinct on (job_name) jsonb_build_object('job', job_name, 'status', status, 'started_at', started_at,
                                                        'finished_at', finished_at, 'error', case when status = 'failed' then 'erro registrado' end) x
        from private.job_runs order by job_name, started_at desc) j),
    'last_failure', (select max(started_at) from private.job_runs where status = 'failed' and started_at > now() - interval '7 days'),
    'outbox_pending', (select count(*) from private.outbox_events where organization_id = v_org and status = 'pending'),
    'outbox_failed', (select count(*) from private.outbox_events where organization_id = v_org and status = 'failed'),
    'files_pending_scan', (select count(*) from public.file_objects where organization_id = v_org and status = 'stored' and scan_status in ('pending', 'error')),
    'uploads_stuck', (select count(*) from public.file_objects where organization_id = v_org and status = 'pending_upload'
                         and created_at < now() - interval '1 hour'));
end;
$$;

-- Agendamentos. Diário roda de hora em hora (idempotente), garantindo que uma
-- falha pontual seja recuperada na hora seguinte.
select cron.schedule('cstennis-daily', '10 * * * *', $$select private.run_job('daily')$$);
select cron.schedule('cstennis-frequent', '* * * * *', $$select private.run_job('frequent')$$);
