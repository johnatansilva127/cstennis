-- =============================================================================
-- Storage privado de comprovantes. Nenhuma política em storage.objects concede
-- acesso a anon/authenticated para este bucket: leitura e escrita acontecem
-- apenas pelo servidor (service role) depois das verificações de autorização
-- (authorize_file_download / begin_payment_submission).
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
