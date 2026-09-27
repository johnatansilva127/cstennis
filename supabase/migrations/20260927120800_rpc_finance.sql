-- =============================================================================
-- RPCs financeiras: Pix, planos, cobranças, comprovantes, pagamentos,
-- estornos, restrições e indicadores.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validação de chave Pix
-- -----------------------------------------------------------------------------
create or replace function private.valid_cpf(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  s int;
  r int;
begin
  if p !~ '^[0-9]{11}$' or p ~ '^(\d)\1{10}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 11) i;
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

create or replace function private.valid_cnpj(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  r int;
begin
  if p !~ '^[0-9]{14}$' or p ~ '^(\d)\1{13}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 14) i;
  s := 0;
  for i in 1..12 loop s := s + d[i] * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> d[13] then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + d[i] * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = d[14];
end;
$$;

-- Normaliza e valida a chave; lança CS422 se inválida.
create or replace function private.normalize_pix_key(p_type public.pix_key_type, p_key text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_key, ''));
  digits text := regexp_replace(v, '\D', '', 'g');
begin
  case p_type
    when 'cpf' then
      if not private.valid_cpf(digits) then perform private.fail('CS422', 'CPF inválido.'); end if;
      return digits;
    when 'cnpj' then
      if not private.valid_cnpj(digits) then perform private.fail('CS422', 'CNPJ inválido.'); end if;
      return digits;
    when 'email' then
      v := lower(v);
      if not private.is_valid_email(v) or char_length(v) > 77 then perform private.fail('CS422', 'E-mail inválido para chave Pix.'); end if;
      return v;
    when 'phone' then
      if digits ~ '^55[1-9][0-9]{9,10}$' then return '+' || digits; end if;
      if digits ~ '^[1-9][0-9]{9,10}$' then return '+55' || digits; end if;
      perform private.fail('CS422', 'Telefone inválido para chave Pix (use DDD + número).');
    when 'evp' then
      v := lower(v);
      if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        perform private.fail('CS422', 'Chave aleatória inválida.');
      end if;
      return v;
  end case;
  return null;
end;
$$;

create or replace function private.mask_secret(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null
              when char_length(p) <= 4 then '****'
              else left(p, 2) || repeat('*', greatest(char_length(p) - 4, 3)) || right(p, 2) end;
$$;

create or replace function public.update_pix_settings(
  p_receiver_name text, p_key_type public.pix_key_type, p_pix_key text, p_city text, p_brcode_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_before public.pix_settings;
  v_key text;
  v_name text := private.clean_text(p_receiver_name, 60);
  v_city text := upper(private.clean_text(p_city, 15));
begin
  perform private.require_recent_mfa();
  perform private.enforce_rate_limit('pix:update:' || v_org::text, 10, 3600);
  if v_name is null or char_length(v_name) < 2 then
    perform private.fail('CS422', 'Informe o nome do recebedor (como aparece no banco).');
  end if;
  if v_city is null or char_length(v_city) < 2 then
    perform private.fail('CS422', 'Informe a cidade do recebedor.');
  end if;
  v_key := private.normalize_pix_key(p_key_type, p_pix_key);
  select * into v_before from public.pix_settings where organization_id = v_org;

  insert into public.pix_settings (organization_id, receiver_name, key_type, pix_key, city, brcode_enabled, updated_by, updated_at)
  values (v_org, v_name, p_key_type, v_key, v_city, coalesce(p_brcode_enabled, false), auth.uid(), now())
  on conflict (organization_id) do update set
    receiver_name = excluded.receiver_name, key_type = excluded.key_type, pix_key = excluded.pix_key,
    city = excluded.city, brcode_enabled = excluded.brcode_enabled, updated_by = excluded.updated_by, updated_at = now();

  -- Auditoria sem a chave completa.
  perform private.audit(v_org, 'pix.update', 'pix_settings', v_org, null, jsonb_build_object(
    'before', case when v_before.organization_id is null then null else jsonb_build_object(
      'receiver_name', v_before.receiver_name, 'key_type', v_before.key_type, 'key', private.mask_secret(v_before.pix_key)) end,
    'after', jsonb_build_object('receiver_name', v_name, 'key_type', p_key_type, 'key', private.mask_secret(v_key),
                                'brcode_enabled', coalesce(p_brcode_enabled, false))));
  perform private.emit(v_org, 'pix_changed', '{}'::jsonb, format('pix_changed:%s:%s', v_org, extract(epoch from clock_timestamp())));
end;
$$;

-- -----------------------------------------------------------------------------
-- Planos de mensalidade
-- -----------------------------------------------------------------------------
create or replace function private.set_tuition_internal(
  p_student public.students, p_amount int, p_due_day int, p_starts_month date, p_ends_month date, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today(p_student.organization_id);
  v_start date := date_trunc('month', p_starts_month)::date;
  v_end date := case when p_ends_month is null then null else date_trunc('month', p_ends_month)::date end;
  v_id uuid;
  t record;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    perform private.fail('CS422', 'Valor da mensalidade inválido.');
  end if;
  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then
    perform private.fail('CS422', 'Dia de vencimento deve ser entre 1 e 31.');
  end if;
  if v_start is null or v_start < date_trunc('month', v_today)::date then
    perform private.fail('CS422', 'Planos e reajustes não são retroativos: escolha o mês atual ou um mês futuro.');
  end if;
  if v_end is not null and v_end < v_start then
    perform private.fail('CS422', 'Mês final anterior ao inicial.');
  end if;

  for t in select * from public.tuition_terms
            where student_id = p_student.id
              and daterange(starts_month, ends_month, '[]') && daterange(v_start, v_end, '[]')
            for update
  loop
    if t.starts_month < v_start then
      update public.tuition_terms set ends_month = (v_start - interval '1 month')::date where id = t.id;
    elsif exists (select 1 from public.invoices where tuition_term_id = t.id) then
      perform private.fail('CS409', 'Já existe cobrança emitida com um plano deste período; encerre-o a partir do mês seguinte.');
    else
      delete from public.tuition_terms where id = t.id;
    end if;
  end loop;

  insert into public.tuition_terms (organization_id, student_id, amount_cents, due_day, starts_month, ends_month, notes, created_by)
  values (p_student.organization_id, p_student.id, p_amount, p_due_day, v_start, v_end, private.clean_text(p_notes, 300), auth.uid())
  returning id into v_id;
  perform private.audit(p_student.organization_id, 'tuition.set', 'tuition_term', v_id, p_student.id,
    jsonb_build_object('amount_cents', p_amount, 'due_day', p_due_day, 'starts_month', v_start, 'ends_month', v_end));
  return v_id;
end;
$$;

create or replace function public.set_tuition_term(
  p_student_id uuid, p_amount_cents int, p_due_day int, p_starts_month date, p_ends_month date default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.set_tuition_internal(private.coach_student(p_student_id), p_amount_cents, p_due_day,
                                      p_starts_month, p_ends_month, p_notes);
end;
$$;

create or replace function public.end_tuition_term(p_term_id uuid, p_ends_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tuition_terms;
  v_end date := date_trunc('month', p_ends_month)::date;
begin
  select * into v from public.tuition_terms where id = p_term_id for update;
  perform private.require_coach(v.organization_id);
  if v_end is null or v_end < v.starts_month then
    perform private.fail('CS422', 'Mês final inválido.');
  end if;
  if v_end < date_trunc('month', private.org_today(v.organization_id))::date - interval '1 month' then
    perform private.fail('CS422', 'Encerramento não pode ser retroativo a mais de um mês.');
  end if;
  update public.tuition_terms set ends_month = v_end where id = v.id;
  perform private.audit(v.organization_id, 'tuition.end', 'tuition_term', v.id, v.student_id, jsonb_build_object('ends_month', v_end));
end;
$$;

-- -----------------------------------------------------------------------------
-- Geração de cobranças com eventos (usada pelo job e pelo botão "gerar agora")
-- -----------------------------------------------------------------------------
create or replace function private.run_invoice_generation(p_org uuid, p_today date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in select * from private.generate_invoices(p_org, p_today) loop
    v_count := v_count + 1;
    perform private.emit(p_org, 'invoice_created', jsonb_build_object('invoice_id', r.invoice_id, 'student_id', r.student_id),
                         'invoice_created:' || r.invoice_id::text);
  end loop;
  return v_count;
end;
$$;

create or replace function public.generate_invoices_now()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('invoices:' || v_org::text, 0));
  v_count := private.run_invoice_generation(v_org, private.org_today(v_org));
  perform private.audit(v_org, 'invoice.generate', 'organization', v_org, null, jsonb_build_object('created', v_count));
  return v_count;
end;
$$;

create or replace function public.create_manual_invoice(
  p_student_id uuid, p_competence date, p_amount_cents int, p_due_date date, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.students := private.coach_student(p_student_id);
  v_comp date := date_trunc('month', p_competence)::date;
  v_id uuid;
begin
  if private.clean_text(p_reason, 300) is null then
    perform private.fail('CS422', 'Informe a justificativa da cobrança manual.');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    perform private.fail('CS422', 'Valor inválido.');
  end if;
  if p_due_date is null then
    perform private.fail('CS422', 'Informe o vencimento.');
  end if;
  if exists (select 1 from public.invoices where student_id = v_s.id and competence = v_comp and status <> 'cancelled') then
    perform private.fail('CS409', 'Já existe cobrança ativa para esta competência.');
  end if;
  insert into public.invoices (organization_id, student_id, competence, amount_cents, original_amount_cents, due_date,
                               generated_by, created_by, adjustment_reason)
  values (v_s.organization_id, v_s.id, v_comp, p_amount_cents, p_amount_cents, p_due_date, 'coach', auth.uid(),
          private.clean_text(p_reason, 300))
  returning id into v_id;
  perform private.audit(v_s.organization_id, 'invoice.create_manual', 'invoice', v_id, v_s.id,
    jsonb_build_object('competence', v_comp, 'amount_cents', p_amount_cents, 'due_date', p_due_date, 'reason', p_reason));
  perform private.emit(v_s.organization_id, 'invoice_created', jsonb_build_object('invoice_id', v_id, 'student_id', v_s.id),
                       'invoice_created:' || v_id::text);
  perform private.refresh_restriction_state(v_s.id);
  return v_id;
end;
$$;

create or replace function public.adjust_invoice(p_invoice_id uuid, p_amount_cents int, p_due_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice_id for update;
  perform private.require_coach(v.organization_id);
  if v.status <> 'open' then
    perform private.fail('CS409', 'Só é possível ajustar cobranças em aberto (sem comprovante em análise).');
  end if;
  if private.clean_text(p_reason, 300) is null then
    perform private.fail('CS422', 'Informe a justificativa do ajuste.');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 or p_due_date is null then
    perform private.fail('CS422', 'Valor ou vencimento inválido.');
  end if;
  update public.invoices set amount_cents = p_amount_cents, due_date = p_due_date, adjusted_by = auth.uid(),
         adjusted_at = now(), adjustment_reason = private.clean_text(p_reason, 300)
   where id = v.id;
  perform private.audit(v.organization_id, 'invoice.adjust', 'invoice', v.id, v.student_id, jsonb_build_object(
    'before', jsonb_build_object('amount_cents', v.amount_cents, 'due_date', v.due_date),
    'after', jsonb_build_object('amount_cents', p_amount_cents, 'due_date', p_due_date), 'reason', p_reason));
  perform private.refresh_restriction_state(v.student_id);
end;
$$;

create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices;
  v_reason text := private.clean_text(p_reason, 300);
begin
  select * into v from public.invoices where id = p_invoice_id for update;
  perform private.require_coach(v.organization_id);
  if v.status not in ('open', 'under_review') then
    perform private.fail('CS409', 'Somente cobranças não pagas podem ser canceladas.');
  end if;
  if v_reason is null then
    perform private.fail('CS422', 'Informe o motivo do cancelamento.');
  end if;
  update public.payment_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = 'Cobrança cancelada pelo professor.'
   where invoice_id = v.id and status in ('received', 'under_review');
  update public.invoices set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason
   where id = v.id;
  perform private.audit(v.organization_id, 'invoice.cancel', 'invoice', v.id, v.student_id, jsonb_build_object('reason', v_reason));
  perform private.refresh_restriction_state(v.student_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Comprovantes
-- -----------------------------------------------------------------------------
create or replace function public.begin_payment_submission(
  p_invoice_id uuid, p_detected_type text, p_mime_type text, p_size_bytes int, p_sha256 text,
  p_width int default null, p_height int default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoices;
  v_file uuid;
  v_sub uuid;
  v_path text;
begin
  if v_uid is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or not private.can_access_student(v_inv.student_id) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if v_inv.status = 'paid' then
    perform private.fail('CS409', 'Esta cobrança já está paga.');
  elsif v_inv.status = 'cancelled' then
    perform private.fail('CS409', 'Esta cobrança foi cancelada.');
  end if;
  if not ((p_detected_type = 'jpeg' and p_mime_type = 'image/jpeg')
       or (p_detected_type = 'png' and p_mime_type = 'image/png')
       or (p_detected_type = 'pdf' and p_mime_type = 'application/pdf')) then
    perform private.fail('CS422', 'Tipo de arquivo não aceito. Envie JPEG, PNG ou PDF.');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    perform private.fail('CS422', 'Arquivo vazio ou maior que 10 MB.');
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    perform private.fail('CS422', 'Arquivo inválido.');
  end if;
  if exists (select 1 from public.payment_submissions
              where invoice_id = v_inv.id and status in ('received', 'under_review')) then
    perform private.fail('CS409', 'Já existe um comprovante em análise para esta cobrança. Aguarde a conferência ou cancele o envio anterior.');
  end if;
  if (select count(*) from public.payment_submissions where invoice_id = v_inv.id) >= 10 then
    perform private.fail('CS429', 'Limite de envios para esta cobrança atingido. Fale com o professor.');
  end if;
  perform private.enforce_rate_limit('upload:hour:' || v_uid::text, 10, 3600);
  perform private.enforce_rate_limit('upload:day:' || v_uid::text, 30, 86400);

  v_path := 'proofs/' || v_inv.organization_id::text || '/' || gen_random_uuid()::text;
  insert into public.file_objects (organization_id, bucket, object_path, purpose, detected_type, mime_type, size_bytes,
                                   sha256, image_width, image_height, uploaded_by)
  values (v_inv.organization_id, 'payment-proofs', v_path, 'payment_proof', p_detected_type, p_mime_type, p_size_bytes,
          p_sha256, p_width, p_height, v_uid)
  returning id into v_file;
  insert into public.payment_submissions (organization_id, invoice_id, student_id, file_id, submitted_by, payer_note)
  values (v_inv.organization_id, v_inv.id, v_inv.student_id, v_file, v_uid, private.clean_text(p_note, 500))
  returning id into v_sub;
  return jsonb_build_object('submission_id', v_sub, 'file_id', v_file, 'bucket', 'payment-proofs', 'object_path', v_path);
end;
$$;

-- Chamado pelo servidor (service_role) depois de baixar o objeto enviado,
-- validar os bytes reais (tipo, tamanho, estrutura) e verificar antimalware.
create or replace function public.complete_payment_submission_upload(
  p_file_id uuid, p_scan_status public.scan_status, p_scan_engine text,
  p_sha256 text default null, p_size_bytes int default null, p_width int default null, p_height int default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_sub public.payment_submissions;
  v_inv public.invoices;
begin
  select * into v_file from public.file_objects where id = p_file_id for update;
  if v_file.id is null or v_file.status <> 'pending_upload' then
    perform private.fail('CS409', 'Arquivo em estado inválido.');
  end if;
  select * into v_sub from public.payment_submissions where file_id = v_file.id for update;
  select * into v_inv from public.invoices where id = v_sub.invoice_id for update;

  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    perform private.fail('CS422', 'Hash inválido.');
  end if;
  if p_size_bytes is not null and (p_size_bytes <= 0 or p_size_bytes > 10485760) then
    perform private.fail('CS422', 'Tamanho inválido.');
  end if;
  update public.file_objects set status = 'stored', scan_status = p_scan_status, scan_engine = p_scan_engine,
         scanned_at = case when p_scan_status = 'pending' then null else now() end,
         sha256 = coalesce(p_sha256, sha256), size_bytes = coalesce(p_size_bytes, size_bytes),
         image_width = coalesce(p_width, image_width), image_height = coalesce(p_height, image_height)
   where id = v_file.id;

  if p_scan_status = 'infected' then
    update public.payment_submissions set status = 'rejected', reviewed_at = now(),
           rejection_reason = 'Arquivo recusado pela verificação de segurança. Envie outro arquivo.'
     where id = v_sub.id;
    perform private.audit(v_sub.organization_id, 'file.infected', 'file_object', v_file.id, v_sub.student_id,
      jsonb_build_object('engine', p_scan_engine));
    perform private.emit(v_sub.organization_id, 'submission_rejected',
      jsonb_build_object('submission_id', v_sub.id, 'invoice_id', v_sub.invoice_id, 'student_id', v_sub.student_id),
      'submission_rejected:' || v_sub.id::text);
    return 'rejected';
  end if;

  if v_inv.status in ('paid', 'cancelled') then
    update public.payment_submissions set status = 'rejected', reviewed_at = now(),
           rejection_reason = case v_inv.status when 'paid' then 'Cobrança já quitada.' else 'Cobrança cancelada.' end
     where id = v_sub.id;
    return 'rejected';
  end if;

  update public.payment_submissions set status = 'received', received_at = now() where id = v_sub.id;
  if v_inv.status = 'open' then
    update public.invoices set status = 'under_review' where id = v_inv.id;
  end if;
  perform private.audit(v_sub.organization_id, 'payment_submission.received', 'payment_submission', v_sub.id, v_sub.student_id,
    jsonb_build_object('invoice_id', v_inv.id, 'scan_status', p_scan_status, 'size', v_file.size_bytes, 'type', v_file.detected_type));
  perform private.emit(v_sub.organization_id, 'payment_submission_received',
    jsonb_build_object('submission_id', v_sub.id, 'invoice_id', v_inv.id, 'student_id', v_sub.student_id),
    'payment_submission_received:' || v_sub.id::text);
  return 'received';
end;
$$;

create or replace function public.fail_payment_submission_upload(p_file_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
begin
  select * into v_file from public.file_objects where id = p_file_id for update;
  if v_file.id is null or v_file.status <> 'pending_upload' then
    return;
  end if;
  update public.file_objects set status = 'deleted', deleted_at = now(), deleted_reason = left(coalesce(p_reason, 'upload_failed'), 200)
   where id = v_file.id;
  update public.payment_submissions set status = 'withdrawn' where file_id = v_file.id and status = 'uploading';
end;
$$;

create or replace function public.set_file_scan_result(p_file_id uuid, p_scan_status public.scan_status, p_scan_engine text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_sub public.payment_submissions;
  v_inv public.invoices;
begin
  select * into v_file from public.file_objects where id = p_file_id for update;
  if v_file.id is null or v_file.status <> 'stored' or v_file.scan_status not in ('pending', 'error') then
    return;
  end if;
  update public.file_objects set scan_status = p_scan_status, scan_engine = p_scan_engine,
         scanned_at = case when p_scan_status = 'pending' then null else now() end
   where id = v_file.id;
  if p_scan_status = 'infected' then
    select * into v_sub from public.payment_submissions where file_id = v_file.id for update;
    if v_sub.status in ('received', 'under_review') then
      update public.payment_submissions set status = 'rejected', reviewed_at = now(),
             rejection_reason = 'Arquivo recusado pela verificação de segurança. Envie outro arquivo.'
       where id = v_sub.id;
      select * into v_inv from public.invoices where id = v_sub.invoice_id for update;
      if v_inv.status = 'under_review' and not exists (
           select 1 from public.payment_submissions where invoice_id = v_inv.id and status in ('received', 'under_review')) then
        update public.invoices set status = 'open' where id = v_inv.id;
      end if;
      perform private.emit(v_sub.organization_id, 'submission_rejected',
        jsonb_build_object('submission_id', v_sub.id, 'invoice_id', v_sub.invoice_id, 'student_id', v_sub.student_id),
        'submission_rejected:' || v_sub.id::text);
    end if;
    perform private.audit(v_file.organization_id, 'file.infected', 'file_object', v_file.id, v_sub.student_id,
      jsonb_build_object('engine', p_scan_engine));
  end if;
end;
$$;

create or replace function public.withdraw_payment_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.payment_submissions;
  v_inv public.invoices;
begin
  select * into v from public.payment_submissions where id = p_submission_id for update;
  if v.id is null or not private.can_access_student(v.student_id) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if v.status not in ('received', 'under_review') then
    perform private.fail('CS409', 'Este envio não pode mais ser cancelado.');
  end if;
  select * into v_inv from public.invoices where id = v.invoice_id for update;
  update public.payment_submissions set status = 'withdrawn' where id = v.id;
  if v_inv.status = 'under_review' then
    update public.invoices set status = 'open' where id = v_inv.id;
  end if;
  perform private.audit(v.organization_id, 'payment_submission.withdraw', 'payment_submission', v.id, v.student_id, '{}'::jsonb);
end;
$$;

-- Conferência pelo professor: 'start_review' | 'approve' | 'reject'.
create or replace function public.review_payment_submission(
  p_submission_id uuid, p_action text, p_reason text default null, p_paid_on date default null,
  p_method public.payment_method default 'pix'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.payment_submissions;
  v_inv public.invoices;
  v_today date;
  v_paid_on date;
  v_payment uuid;
begin
  select * into v from public.payment_submissions where id = p_submission_id for update;
  perform private.require_coach(v.organization_id);
  select * into v_inv from public.invoices where id = v.invoice_id for update;
  v_today := private.org_today(v.organization_id);

  if p_action = 'start_review' then
    if v.status = 'received' then
      update public.payment_submissions set status = 'under_review', reviewed_by = auth.uid() where id = v.id;
    end if;
    return null;
  elsif p_action = 'approve' then
    if v.status = 'approved' then
      select id into v_payment from public.payments where submission_id = v.id;
      return v_payment; -- idempotente
    end if;
    if v.status not in ('received', 'under_review') then
      perform private.fail('CS409', 'Este comprovante não está aguardando conferência.');
    end if;
    if v_inv.status = 'paid' then
      perform private.fail('CS409', 'Esta cobrança já está quitada.');
    end if;
    if v_inv.status = 'cancelled' then
      perform private.fail('CS409', 'Esta cobrança foi cancelada.');
    end if;
    v_paid_on := coalesce(p_paid_on, v_today);
    if v_paid_on > v_today or v_paid_on < v_today - 400 then
      perform private.fail('CS422', 'Data do pagamento inválida.');
    end if;
    insert into public.payments (organization_id, invoice_id, student_id, amount_cents, paid_on, method, source,
                                 submission_id, created_by)
    values (v.organization_id, v_inv.id, v_inv.student_id, v_inv.amount_cents, v_paid_on, coalesce(p_method, 'pix'),
            'submission', v.id, auth.uid())
    returning id into v_payment;
    update public.payment_submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v.id;
    update public.invoices set status = 'paid', paid_at = now() where id = v_inv.id;
    update public.payment_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           rejection_reason = 'Cobrança já quitada por outro comprovante.'
     where invoice_id = v_inv.id and id <> v.id and status in ('received', 'under_review');
    perform private.audit(v.organization_id, 'payment.approve_submission', 'payment', v_payment, v.student_id,
      jsonb_build_object('invoice_id', v_inv.id, 'submission_id', v.id, 'amount_cents', v_inv.amount_cents, 'paid_on', v_paid_on));
    perform private.emit(v.organization_id, 'submission_approved',
      jsonb_build_object('submission_id', v.id, 'invoice_id', v_inv.id, 'student_id', v.student_id),
      'payment_confirmed:' || v_payment::text);
    perform private.refresh_restriction_state(v.student_id);
    return v_payment;
  elsif p_action = 'reject' then
    if private.clean_text(p_reason, 500) is null then
      perform private.fail('CS422', 'Informe o motivo da rejeição (ele será exibido ao pagador).');
    end if;
    if v.status = 'rejected' then
      return null;
    end if;
    if v.status not in ('received', 'under_review') then
      perform private.fail('CS409', 'Este comprovante não está aguardando conferência.');
    end if;
    update public.payment_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           rejection_reason = private.clean_text(p_reason, 500)
     where id = v.id;
    if v_inv.status = 'under_review' and not exists (
         select 1 from public.payment_submissions where invoice_id = v_inv.id and status in ('received', 'under_review')) then
      update public.invoices set status = 'open' where id = v_inv.id;
    end if;
    perform private.audit(v.organization_id, 'payment_submission.reject', 'payment_submission', v.id, v.student_id,
      jsonb_build_object('reason', p_reason));
    perform private.emit(v.organization_id, 'submission_rejected',
      jsonb_build_object('submission_id', v.id, 'invoice_id', v_inv.id, 'student_id', v.student_id),
      'submission_rejected:' || v.id::text);
    perform private.refresh_restriction_state(v.student_id);
    return null;
  end if;
  perform private.fail('CS422', 'Ação inválida.');
end;
$$;

create or replace function public.record_manual_payment(
  p_invoice_id uuid, p_amount_cents int, p_paid_on date, p_method public.payment_method, p_justification text,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_existing public.payments;
  v_today date;
  v_id uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  perform private.require_coach(v_inv.organization_id);
  if p_idempotency_key is not null then
    select * into v_existing from public.payments where idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      if v_existing.invoice_id <> v_inv.id then
        perform private.fail('CS409', 'Chave de idempotência reutilizada.');
      end if;
      return v_existing.id;
    end if;
  end if;
  v_today := private.org_today(v_inv.organization_id);
  if v_inv.status = 'paid' then
    perform private.fail('CS409', 'Esta cobrança já está quitada.');
  end if;
  if v_inv.status = 'cancelled' then
    perform private.fail('CS409', 'Esta cobrança foi cancelada.');
  end if;
  if exists (select 1 from public.payment_submissions where invoice_id = v_inv.id and status in ('received', 'under_review')) then
    perform private.fail('CS409', 'Há comprovante aguardando conferência; aprove ou rejeite-o antes da baixa manual.');
  end if;
  if p_amount_cents is distinct from v_inv.amount_cents then
    perform private.fail('CS422', 'Nesta versão a baixa precisa quitar o valor integral da cobrança. Se necessário, ajuste a cobrança antes, com justificativa.');
  end if;
  if private.clean_text(p_justification, 500) is null or char_length(btrim(p_justification)) < 5 then
    perform private.fail('CS422', 'Informe a justificativa da baixa manual.');
  end if;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < v_today - 400 then
    perform private.fail('CS422', 'Data do pagamento inválida.');
  end if;
  insert into public.payments (organization_id, invoice_id, student_id, amount_cents, paid_on, method, source,
                               justification, idempotency_key, created_by)
  values (v_inv.organization_id, v_inv.id, v_inv.student_id, p_amount_cents, p_paid_on, p_method, 'manual',
          private.clean_text(p_justification, 500), p_idempotency_key, auth.uid())
  returning id into v_id;
  update public.invoices set status = 'paid', paid_at = now() where id = v_inv.id;
  perform private.audit(v_inv.organization_id, 'payment.manual', 'payment', v_id, v_inv.student_id,
    jsonb_build_object('invoice_id', v_inv.id, 'amount_cents', p_amount_cents, 'paid_on', p_paid_on,
                       'method', p_method, 'justification', p_justification));
  perform private.emit(v_inv.organization_id, 'submission_approved',
    jsonb_build_object('invoice_id', v_inv.id, 'student_id', v_inv.student_id), 'payment_confirmed:' || v_id::text);
  perform private.refresh_restriction_state(v_inv.student_id);
  return v_id;
exception
  when unique_violation then
    perform private.fail('CS409', 'Esta cobrança já possui pagamento confirmado.');
end;
$$;

create or replace function public.reverse_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.payments;
  v_id uuid;
  v_reason text := private.clean_text(p_reason, 500);
begin
  select * into v from public.payments where id = p_payment_id for update;
  perform private.require_coach(v.organization_id);
  perform private.require_recent_mfa();
  if v.reversed_at is not null then
    perform private.fail('CS409', 'Este pagamento já foi estornado.');
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    perform private.fail('CS422', 'Informe o motivo do estorno.');
  end if;
  perform 1 from public.invoices where id = v.invoice_id for update;
  insert into public.payment_reversals (organization_id, payment_id, reason, created_by)
  values (v.organization_id, v.id, v_reason, auth.uid())
  returning id into v_id;
  update public.payments set reversed_at = now() where id = v.id;
  update public.invoices set
    status = case when exists (select 1 from public.payment_submissions s
                                where s.invoice_id = v.invoice_id and s.status in ('received', 'under_review'))
                  then 'under_review'::public.invoice_status else 'open'::public.invoice_status end,
    paid_at = null
  where id = v.invoice_id;
  perform private.audit(v.organization_id, 'payment.reverse', 'payment', v.id, v.student_id,
    jsonb_build_object('invoice_id', v.invoice_id, 'amount_cents', v.amount_cents, 'reason', v_reason));
  perform private.emit(v.organization_id, 'payment_reversed',
    jsonb_build_object('payment_id', v.id, 'invoice_id', v.invoice_id, 'student_id', v.student_id),
    'payment_reversed:' || v.id::text);
  perform private.refresh_restriction_state(v.student_id);
  return v_id;
end;
$$;

-- Autoriza download de comprovante: somente professor da organização ou
-- conta vinculada ao aluno; somente arquivos armazenados e verificados.
create or replace function public.authorize_file_download(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.file_objects;
  v_sub public.payment_submissions;
  v_is_coach boolean;
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  select * into v_file from public.file_objects where id = p_file_id;
  select * into v_sub from public.payment_submissions where file_id = p_file_id;
  if v_file.id is null or v_sub.id is null then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  v_is_coach := private.is_coach_of(v_file.organization_id);
  if not v_is_coach and not private.can_access_student(v_sub.student_id) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  perform private.enforce_rate_limit('download:' || auth.uid()::text, 120, 3600);
  if v_file.status <> 'stored' then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;
  if v_file.scan_status <> 'clean' then
    return jsonb_build_object('allowed', false, 'reason', v_file.scan_status);
  end if;
  if v_is_coach then
    perform private.audit(v_file.organization_id, 'file.download', 'file_object', v_file.id, v_sub.student_id, '{}'::jsonb);
  end if;
  return jsonb_build_object('allowed', true, 'bucket', v_file.bucket, 'object_path', v_file.object_path,
                            'mime_type', v_file.mime_type, 'detected_type', v_file.detected_type, 'size_bytes', v_file.size_bytes);
end;
$$;

-- -----------------------------------------------------------------------------
-- Restrições
-- -----------------------------------------------------------------------------
create or replace function public.set_access_policy(p_student_id uuid, p_mode public.restriction_mode, p_grace_days int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_s public.students;
  r record;
begin
  if p_grace_days is not null and (p_grace_days < 0 or p_grace_days > 60) then
    perform private.fail('CS422', 'Tolerância deve ficar entre 0 e 60 dias.');
  end if;
  if p_student_id is null then
    v_org := private.my_coach_org();
    if p_mode is null then
      perform private.fail('CS422', 'Escolha a regra geral.');
    end if;
    insert into public.access_policies (organization_id, student_id, mode, grace_days, updated_by, updated_at)
    values (v_org, null, p_mode, coalesce(p_grace_days, 0), auth.uid(), now())
    on conflict (organization_id) where student_id is null
    do update set mode = excluded.mode, grace_days = excluded.grace_days, updated_by = excluded.updated_by, updated_at = now();
    perform private.audit(v_org, 'access_policy.org', 'organization', v_org, null,
      jsonb_build_object('mode', p_mode, 'grace_days', coalesce(p_grace_days, 0)));
    for r in select distinct student_id from public.invoices where organization_id = v_org and status in ('open', 'under_review') loop
      perform private.refresh_restriction_state(r.student_id);
    end loop;
  else
    v_s := private.coach_student(p_student_id);
    v_org := v_s.organization_id;
    if p_mode is null then
      delete from public.access_policies where student_id = v_s.id;
    else
      insert into public.access_policies (organization_id, student_id, mode, grace_days, updated_by, updated_at)
      values (v_org, v_s.id, p_mode, coalesce(p_grace_days, 0), auth.uid(), now())
      on conflict (student_id) where student_id is not null
      do update set mode = excluded.mode, grace_days = excluded.grace_days, updated_by = excluded.updated_by, updated_at = now();
    end if;
    perform private.audit(v_org, 'access_policy.student', 'student', v_s.id, v_s.id,
      jsonb_build_object('mode', p_mode, 'grace_days', p_grace_days));
    perform private.refresh_restriction_state(v_s.id);
  end if;
end;
$$;

create or replace function public.create_access_override(
  p_student_id uuid, p_kind public.override_kind, p_reason text, p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.students := private.coach_student(p_student_id);
  v_id uuid;
  v_reason text := private.clean_text(p_reason, 500);
begin
  if v_reason is null or char_length(v_reason) < 3 then
    perform private.fail('CS422', 'Informe o motivo.');
  end if;
  if p_kind = 'release' and (p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '90 days') then
    perform private.fail('CS422', 'Liberação temporária precisa de prazo entre agora e 90 dias.');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    perform private.fail('CS422', 'Prazo precisa ser futuro.');
  end if;
  update public.access_overrides set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Substituída por nova regra'
   where student_id = v_s.id and revoked_at is null and (expires_at is null or expires_at > now());
  insert into public.access_overrides (organization_id, student_id, kind, reason, expires_at, created_by)
  values (v_s.organization_id, v_s.id, p_kind, v_reason, p_expires_at, auth.uid())
  returning id into v_id;
  perform private.audit(v_s.organization_id, 'access_override.create', 'access_override', v_id, v_s.id,
    jsonb_build_object('kind', p_kind, 'reason', v_reason, 'expires_at', p_expires_at));
  perform private.refresh_restriction_state(v_s.id);
  return v_id;
end;
$$;

create or replace function public.revoke_access_override(p_override_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.access_overrides;
begin
  select * into v from public.access_overrides where id = p_override_id for update;
  perform private.require_coach(v.organization_id);
  if v.revoked_at is not null then
    perform private.fail('CS409', 'Regra já revogada.');
  end if;
  update public.access_overrides set revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = coalesce(private.clean_text(p_reason, 500), 'Revogada pelo professor')
   where id = v.id;
  perform private.audit(v.organization_id, 'access_override.revoke', 'access_override', v.id, v.student_id,
    jsonb_build_object('reason', p_reason));
  perform private.refresh_restriction_state(v.student_id);
end;
$$;

create or replace function public.student_restriction(p_student_id uuid)
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
  if v_org is null or not (private.is_coach_of(v_org) or private.can_access_student(p_student_id)) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  select * into r from private.compute_restriction(p_student_id, private.org_today(v_org));
  return jsonb_build_object(
    'level', r.level, 'mode', r.mode, 'grace_days', r.grace_days, 'overdue_count', r.overdue_count,
    'oldest_due_date', r.oldest_due_date, 'effective_from', r.effective_from,
    'override_kind', r.override_kind, 'override_expires_at', r.override_expires_at,
    'override_reason', case when private.is_coach_of(v_org) then r.override_reason end,
    'today', private.org_today(v_org));
end;
$$;

create or replace function public.payment_instructions(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_pix public.pix_settings;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if v_inv.id is null or not (private.is_coach_of(v_inv.organization_id) or private.can_access_student(v_inv.student_id)) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  select * into v_pix from public.pix_settings where organization_id = v_inv.organization_id;
  return jsonb_build_object(
    'configured', v_pix.organization_id is not null,
    'receiver_name', v_pix.receiver_name, 'key_type', v_pix.key_type, 'pix_key', v_pix.pix_key, 'city', v_pix.city,
    'brcode_enabled', coalesce(v_pix.brcode_enabled, false),
    'amount_cents', v_inv.amount_cents, 'competence', v_inv.competence, 'due_date', v_inv.due_date,
    'invoice_status', v_inv.status, 'invoice_id', v_inv.id);
end;
$$;

-- Indicadores financeiros (critérios explicados na interface):
--  expected: soma das cobranças não canceladas com competência no período;
--  received: pagamentos confirmados (não estornados) com data de pagamento no período;
--  receivable: cobranças da competência em aberto/em análise ainda não vencidas;
--  overdue: cobranças da competência em aberto/em análise vencidas (data local);
--  under_review: cobranças da competência com comprovante em análise (não é receita);
--  cancelled / reversed: exibidos à parte, sem distorcer os totais.
create or replace function public.finance_summary(p_from_month date, p_to_month date, p_student_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_coach_org();
  v_today date := private.org_today(v_org);
  v_from date := date_trunc('month', p_from_month)::date;
  v_to date := date_trunc('month', p_to_month)::date;
  v_to_end date := (date_trunc('month', p_to_month) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if v_to < v_from or v_to - v_from > 800 then
    perform private.fail('CS422', 'Período inválido.');
  end if;
  with inv as (
    select * from public.invoices i
     where i.organization_id = v_org and i.competence between v_from and v_to
       and (p_student_id is null or i.student_id = p_student_id)
  ), pay as (
    select * from public.payments p
     where p.organization_id = v_org and p.reversed_at is null and p.paid_on between v_from and v_to_end
       and (p_student_id is null or p.student_id = p_student_id)
  ), rev as (
    select r.*, p.amount_cents from public.payment_reversals r join public.payments p on p.id = r.payment_id
     where r.organization_id = v_org and (r.created_at at time zone private.org_timezone(v_org))::date between v_from and v_to_end
       and (p_student_id is null or p.student_id = p_student_id)
  )
  select jsonb_build_object(
    'today', v_today,
    'expected_cents', coalesce((select sum(amount_cents) from inv where status <> 'cancelled'), 0),
    'expected_count', (select count(*) from inv where status <> 'cancelled'),
    'received_cents', coalesce((select sum(amount_cents) from pay), 0),
    'received_count', (select count(*) from pay),
    'receivable_cents', coalesce((select sum(amount_cents) from inv where status in ('open', 'under_review') and due_date >= v_today), 0),
    'overdue_cents', coalesce((select sum(amount_cents) from inv where status in ('open', 'under_review') and due_date < v_today), 0),
    'overdue_count', (select count(*) from inv where status in ('open', 'under_review') and due_date < v_today),
    'under_review_cents', coalesce((select sum(amount_cents) from inv where status = 'under_review'), 0),
    'under_review_count', (select count(*) from inv where status = 'under_review'),
    'paid_cents', coalesce((select sum(amount_cents) from inv where status = 'paid'), 0),
    'cancelled_cents', coalesce((select sum(amount_cents) from inv where status = 'cancelled'), 0),
    'cancelled_count', (select count(*) from inv where status = 'cancelled'),
    'reversed_cents', coalesce((select sum(amount_cents) from rev), 0),
    'reversed_count', (select count(*) from rev),
    'by_month', coalesce((select jsonb_agg(m order by m ->> 'competence') from (
        select jsonb_build_object(
          'competence', competence,
          'expected_cents', sum(amount_cents) filter (where status <> 'cancelled'),
          'paid_cents', coalesce(sum(amount_cents) filter (where status = 'paid'), 0),
          'open_cents', coalesce(sum(amount_cents) filter (where status in ('open', 'under_review') and due_date >= v_today), 0),
          'overdue_cents', coalesce(sum(amount_cents) filter (where status in ('open', 'under_review') and due_date < v_today), 0)) m
          from inv group by competence) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
