-- =============================================================================
-- Notificações internas (central de avisos) alimentadas pela outbox.
-- O serviço de notificações é separado do canal: hoje só existe o canal
-- in-app (a própria linha em `notifications`). A tabela
-- private.notification_deliveries fica preparada para canais futuros
-- (ex.: WhatsApp), sem nenhum provedor ativo nesta versão.
-- =============================================================================

create type public.privacy_request_kind as enum ('access', 'correction', 'export', 'deletion');
create type public.privacy_request_status as enum ('open', 'in_progress', 'completed', 'rejected');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid,
  event_id bigint not null,
  category text not null check (category in ('schedule', 'finance', 'evolution', 'matches', 'account')),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 400),
  link_path text check (link_path is null or link_path ~ '^/[A-Za-z0-9/_\-?=&.]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, recipient_user_id)
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_user_id) where read_at is null;

create table private.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  student_id uuid,
  requested_by uuid not null references auth.users (id) on delete restrict,
  kind public.privacy_request_kind not null,
  details text check (details is null or char_length(details) <= 2000),
  status public.privacy_request_status not null default 'open',
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create index privacy_requests_org_idx on public.privacy_requests (organization_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- Renderização mínima (sem dados desnecessários) por evento e destinatário
-- -----------------------------------------------------------------------------
create or replace function private.first_name(p_student uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(full_name, ' ', 1) from public.students where id = p_student;
$$;

create or replace function private.month_label(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])
           [extract(month from p_date)::int] || '/' || extract(year from p_date)::int;
$$;

-- Destinatários de um evento. Eventos de professor vão para os professores da
-- organização; eventos de aluno vão apenas para contas vinculadas ao aluno.
create or replace function private.event_recipients(p_event private.outbox_events)
returns table (user_id uuid, student_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_students uuid[];
begin
  if p_event.event_type in ('invitation_accepted', 'enrollment_request_created', 'payment_submission_received',
                             'pix_changed', 'privacy_request_created') then
    return query
      select m.user_id, (p_event.payload ->> 'student_id')::uuid
        from public.organization_memberships m
       where m.organization_id = p_event.organization_id and m.role = 'coach' and m.status = 'active';
    return;
  end if;

  if p_event.payload ? 'student_ids' then
    select array_agg(value::uuid) into v_students from jsonb_array_elements_text(p_event.payload -> 'student_ids');
  else
    v_students := array[(p_event.payload ->> 'student_id')::uuid];
  end if;

  return query
    select distinct r.uid, s.sid
      from unnest(v_students) as s(sid)
      join public.students st on st.id = s.sid and st.organization_id = p_event.organization_id
      cross join lateral private.student_recipient_user_ids(s.sid) as r(uid);
end;
$$;

create or replace function private.render_notification(p_event private.outbox_events, p_student uuid, p_recipient uuid)
returns table (category text, title text, body text, link_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p jsonb := p_event.payload;
  v_name text := coalesce(private.first_name(p_student), 'Aluno');
  v_self boolean := exists (select 1 from public.student_user_links l
                             where l.student_id = p_student and l.user_id = p_recipient and l.revoked_at is null);
  v_who text := case when v_self then '' else v_name || ': ' end;
  v_ctx text := case when p_student is null then '' else '?aluno=' || p_student::text end;
  v_occ public.lesson_occurrences;
  v_inv public.invoices;
begin
  if p ? 'occurrence_id' then
    select * into v_occ from public.lesson_occurrences where id = (p ->> 'occurrence_id')::uuid;
  end if;
  if p ? 'invoice_id' then
    select * into v_inv from public.invoices where id = (p ->> 'invoice_id')::uuid;
  end if;

  case p_event.event_type
    when 'invitation_accepted' then
      return query select 'account', 'Convite aceito',
        format('%s ativou o acesso como %s.', coalesce(p ->> 'name', 'Uma pessoa'),
               case p ->> 'kind' when 'guardian' then 'responsável' else 'aluno' end),
        case when p ? 'student_id' then '/professor/alunos/' || (p ->> 'student_id') else '/professor/responsaveis' end;
    when 'enrollment_request_created' then
      return query select 'schedule', 'Novo pedido de vaga',
        format('%s pediu uma vaga fixa.', v_name), '/professor/pedidos';
    when 'payment_submission_received' then
      return query select 'finance', 'Comprovante recebido',
        format('%s enviou comprovante da mensalidade de %s.', v_name, private.month_label(v_inv.competence)),
        '/professor/financeiro/comprovantes';
    when 'pix_changed' then
      return query select 'account', 'Dados Pix alterados',
        'Os dados de recebimento Pix foram alterados. Se não foi você, revise sua conta imediatamente.',
        '/professor/configuracoes/pix';
    when 'privacy_request_created' then
      return query select 'account', 'Nova solicitação de privacidade',
        'Há uma solicitação de privacidade aguardando análise.', '/professor/configuracoes/privacidade';
    when 'enrollment_request_decided' then
      return query select 'schedule',
        case when (p ->> 'approved')::boolean then 'Pedido de vaga aprovado' else 'Pedido de vaga recusado' end,
        v_who || case when (p ->> 'approved')::boolean then 'sua vaga fixa foi confirmada.'
                      else 'o pedido não foi aprovado. Veja o motivo no app.' end,
        '/app/horarios' || v_ctx;
    when 'enrollment_created' then
      return query select 'schedule', 'Nova vaga fixa', v_who || 'uma vaga fixa foi adicionada à agenda.', '/app/aulas' || v_ctx;
    when 'enrollment_ended' then
      return query select 'schedule', 'Vaga fixa encerrada', v_who || 'uma vaga fixa foi encerrada.', '/app/aulas' || v_ctx;
    when 'occurrence_cancelled' then
      return query select 'schedule', 'Aula cancelada',
        v_who || format('a aula de %s às %s foi cancelada.', to_char(v_occ.local_date, 'DD/MM'), to_char(v_occ.start_time, 'HH24:MI')),
        '/app/aulas/' || v_occ.id::text || v_ctx;
    when 'occurrence_changed' then
      return query select 'schedule', 'Aula alterada',
        v_who || format('a aula foi remarcada para %s às %s.', to_char(v_occ.local_date, 'DD/MM'), to_char(v_occ.start_time, 'HH24:MI')),
        '/app/aulas/' || v_occ.id::text || v_ctx;
    when 'series_changed' then
      return query select 'schedule', 'Horário fixo alterado',
        v_who || format('o horário fixo mudou a partir de %s.', to_char((p ->> 'effective_date')::date, 'DD/MM/YYYY')),
        '/app/aulas' || v_ctx;
    when 'lesson_reminder' then
      return query select 'schedule', 'Lembrete de aula',
        v_who || format('aula em %s às %s.', to_char(v_occ.local_date, 'DD/MM'), to_char(v_occ.start_time, 'HH24:MI')),
        '/app/aulas/' || v_occ.id::text || v_ctx;
    when 'invoice_created' then
      return query select 'finance', 'Nova mensalidade',
        v_who || format('mensalidade de %s disponível, vencimento em %s.', private.month_label(v_inv.competence), to_char(v_inv.due_date, 'DD/MM/YYYY')),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'invoice_due_soon' then
      return query select 'finance', 'Mensalidade vence em breve',
        v_who || format('mensalidade de %s vence em %s.', private.month_label(v_inv.competence), to_char(v_inv.due_date, 'DD/MM/YYYY')),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'invoice_overdue' then
      return query select 'finance', 'Mensalidade em atraso',
        v_who || format('mensalidade de %s está em atraso.', private.month_label(v_inv.competence)),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'submission_approved' then
      return query select 'finance', 'Pagamento confirmado',
        v_who || format('o professor confirmou o pagamento de %s.', private.month_label(v_inv.competence)),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'submission_rejected' then
      return query select 'finance', 'Comprovante não aprovado',
        v_who || format('o comprovante de %s não foi aprovado. Veja o motivo e reenvie.', private.month_label(v_inv.competence)),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'payment_reversed' then
      return query select 'finance', 'Pagamento estornado',
        v_who || format('o pagamento de %s foi estornado pelo professor.', private.month_label(v_inv.competence)),
        '/app/financeiro/' || v_inv.id::text || v_ctx;
    when 'restriction_changed' then
      return query select 'finance',
        case p ->> 'level' when 'none' then 'Acesso regularizado' else 'Acesso restrito' end,
        v_who || case p ->> 'level'
          when 'none' then 'não há mais restrições por pendência.'
          when 'block_requests' then 'novos pedidos de vaga estão bloqueados por pendência financeira.'
          else 'o acesso a aulas e evolução está restrito por pendência financeira.' end,
        '/app/financeiro' || v_ctx;
    when 'assessment_published' then
      return query select 'evolution', 'Nova avaliação', v_who || 'o professor publicou uma avaliação técnica.', '/app/evolucao' || v_ctx;
    when 'match_commented' then
      return query select 'matches', 'Comentário do professor', v_who || 'o professor comentou um jogo.',
        '/app/jogos/' || (p ->> 'match_id') || v_ctx;
    else
      raise exception 'Tipo de evento desconhecido: %', p_event.event_type;
  end case;
end;
$$;

-- -----------------------------------------------------------------------------
-- Processador da outbox: idempotente, com retries limitados e deduplicação
-- -----------------------------------------------------------------------------
create or replace function private.process_outbox(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event private.outbox_events;
  v_done int := 0;
  r record;
  n record;
begin
  for v_event in
    select * from private.outbox_events
     where status = 'pending' and next_attempt_at <= now()
     order by id
     limit p_limit
     for update skip locked
  loop
    begin
      for r in select * from private.event_recipients(v_event) loop
        select * into n from private.render_notification(v_event, r.student_id, r.user_id);
        insert into public.notifications (organization_id, recipient_user_id, student_id, event_id, category, title, body, link_path)
        values (v_event.organization_id, r.user_id, r.student_id, v_event.id, n.category, n.title, n.body, n.link_path)
        on conflict (event_id, recipient_user_id) do nothing;
      end loop;
      update private.outbox_events set status = 'done', processed_at = now(), last_error = null where id = v_event.id;
      v_done := v_done + 1;
    exception when others then
      update private.outbox_events
         set attempts = attempts + 1,
             last_error = left(sqlerrm, 500),
             status = case when attempts + 1 >= 5 then 'failed' else 'pending' end,
             next_attempt_at = now() + make_interval(mins => power(2, attempts + 1)::int)
       where id = v_event.id;
    end;
  end loop;
  return v_done;
end;
$$;
