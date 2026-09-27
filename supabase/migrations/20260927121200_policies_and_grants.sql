-- =============================================================================
-- Matriz de permissões no banco: RLS em TODAS as tabelas expostas, somente
-- políticas de SELECT (escritas apenas via RPC), grants mínimos.
-- Negar por padrão: sem política = sem acesso.
-- =============================================================================

-- Helpers adicionais usados pelas políticas -----------------------------------
create or replace function private.my_guardian_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.guardians g
   where g.user_id = auth.uid() and g.status = 'active';
$$;

create or replace function private.coach_visible_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.organization_memberships m
   where m.organization_id in (select private.coach_org_ids());
$$;

create or replace function private.visible_file_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.file_id from public.payment_submissions s
   where s.student_id in (select private.accessible_student_ids());
$$;

create or replace function private.visible_match_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.student_matches m
   where m.student_id in (select private.module_student_ids());
$$;

create or replace function private.visible_assessment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.assessments a
   where a.status = 'published' and a.student_id in (select private.module_student_ids());
$$;

create or replace function private.visible_payment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.payments p
   where p.student_id in (select private.accessible_student_ids());
$$;

-- RLS em todas as tabelas públicas ----------------------------------------------
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- Organização e contas
create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.member_org_ids()));

create policy user_profiles_select on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select private.coach_visible_user_ids()));

create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) or organization_id in (select private.coach_org_ids()));

create policy audit_select on public.audit_events for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

-- Pessoas
create policy students_select on public.students for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or id in (select private.accessible_student_ids()));

create policy student_status_changes_select on public.student_status_changes for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy student_private_notes_select on public.student_private_notes for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy guardians_select on public.guardians for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or user_id = (select auth.uid()));

create policy guardian_links_select on public.guardian_student_links for select to authenticated
  using (organization_id in (select private.coach_org_ids())
         or (revoked_at is null and guardian_id in (select private.my_guardian_ids())));

create policy student_user_links_select on public.student_user_links for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or (revoked_at is null and user_id = (select auth.uid())));

create policy invitations_select on public.invitations for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

-- Agenda
create policy locations_select on public.locations for select to authenticated
  using (organization_id in (select private.member_org_ids()));

create policy courts_select on public.courts for select to authenticated
  using (organization_id in (select private.member_org_ids()));

create policy unavailability_select on public.unavailability_periods for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy recurring_slots_select on public.recurring_slots for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

-- Ocorrências: alunos/responsáveis acessam apenas via RPC student_lessons
-- (que filtra pelas próprias matrículas e não expõe colegas).
create policy lesson_occurrences_select on public.lesson_occurrences for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy enrollments_select on public.enrollments for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.module_student_ids()));

create policy enrollment_requests_select on public.enrollment_requests for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.module_student_ids()));

create policy attendance_select on public.attendance for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.module_student_ids()));

-- Financeiro (área de regularização: disponível mesmo com restrição)
create policy pix_settings_select on public.pix_settings for select to authenticated
  using (organization_id in (select private.member_org_ids()));

create policy tuition_terms_select on public.tuition_terms for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.accessible_student_ids()));

create policy invoices_select on public.invoices for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.accessible_student_ids()));

create policy file_objects_select on public.file_objects for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or id in (select private.visible_file_ids()));

create policy payment_submissions_select on public.payment_submissions for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.accessible_student_ids()));

create policy payments_select on public.payments for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.accessible_student_ids()));

create policy payment_reversals_select on public.payment_reversals for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or payment_id in (select private.visible_payment_ids()));

create policy access_policies_select on public.access_policies for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy access_overrides_select on public.access_overrides for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

-- Evolução e jogos
create policy assessments_select on public.assessments for select to authenticated
  using (organization_id in (select private.coach_org_ids())
         or (status = 'published' and student_id in (select private.module_student_ids())));

create policy assessment_scores_select on public.assessment_scores for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or assessment_id in (select private.visible_assessment_ids()));

create policy assessment_private_notes_select on public.assessment_private_notes for select to authenticated
  using (organization_id in (select private.coach_org_ids()));

create policy goals_select on public.goals for select to authenticated
  using (organization_id in (select private.coach_org_ids())
         or (visible_to_student and student_id in (select private.module_student_ids())));

create policy student_matches_select on public.student_matches for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or student_id in (select private.module_student_ids()));

create policy match_sets_select on public.match_sets for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or match_id in (select private.visible_match_ids()));

create policy match_coach_comments_select on public.match_coach_comments for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or match_id in (select private.visible_match_ids()));

-- Avisos e privacidade
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy privacy_requests_select on public.privacy_requests for select to authenticated
  using (organization_id in (select private.coach_org_ids()) or requested_by = (select auth.uid()));

-- Grants ------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Helpers usados em políticas e constraints
grant execute on function
  private.coach_org_ids(), private.member_org_ids(), private.accessible_student_ids(), private.module_student_ids(),
  private.my_guardian_ids(), private.coach_visible_user_ids(), private.visible_file_ids(), private.visible_match_ids(),
  private.visible_assessment_ids(), private.visible_payment_ids(),
  private.is_valid_email(text), private.is_valid_timezone(text)
to authenticated, service_role;

-- RPCs para usuários autenticados (cada uma valida identidade/vínculo)
grant execute on function
  public.my_context(), public.update_my_profile(text, public.theme_preference),
  public.update_organization_settings(jsonb), public.organization_public_info(),
  public.create_invitation(public.invitation_kind, uuid, text), public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.create_guardian(jsonb), public.update_guardian(uuid, jsonb),
  public.link_guardian_student(uuid, uuid, text), public.unlink_guardian_student(uuid, text),
  public.revoke_account_access(text, uuid, text),
  public.create_student(jsonb), public.update_student(uuid, jsonb), public.set_student_private_note(uuid, text),
  public.set_student_status(uuid, public.student_status, date, text, boolean),
  public.save_location(uuid, jsonb), public.save_court(uuid, uuid, jsonb),
  public.create_series(jsonb), public.preview_series_change(uuid, date, jsonb), public.update_series_from(uuid, date, jsonb),
  public.end_series(uuid, date, text),
  public.create_enrollment(uuid, uuid, date, date), public.end_enrollment(uuid, date, text),
  public.list_available_slots(uuid), public.request_enrollment(uuid, uuid, date, text),
  public.cancel_enrollment_request(uuid), public.decide_enrollment_request(uuid, boolean, text, date, boolean),
  public.update_occurrence(uuid, jsonb), public.cancel_occurrence(uuid, text), public.restore_occurrence(uuid),
  public.create_unavailability(date, date, uuid, text),
  public.save_attendance(uuid, jsonb), public.occurrence_attendance(uuid), public.attendance_summary(uuid, date, date),
  public.coach_agenda(date, date), public.student_lessons(uuid, date, date), public.student_enrollments(uuid),
  public.update_pix_settings(text, public.pix_key_type, text, text, boolean),
  public.set_tuition_term(uuid, int, int, date, date, text), public.end_tuition_term(uuid, date),
  public.generate_invoices_now(), public.create_manual_invoice(uuid, date, int, date, text),
  public.adjust_invoice(uuid, int, date, text), public.cancel_invoice(uuid, text),
  public.begin_payment_submission(uuid, text, text, int, text, int, int, text),
  public.withdraw_payment_submission(uuid),
  public.review_payment_submission(uuid, text, text, date, public.payment_method),
  public.record_manual_payment(uuid, int, date, public.payment_method, text, uuid),
  public.reverse_payment(uuid, text), public.authorize_file_download(uuid),
  public.set_access_policy(uuid, public.restriction_mode, int),
  public.create_access_override(uuid, public.override_kind, text, timestamptz), public.revoke_access_override(uuid, text),
  public.student_restriction(uuid), public.payment_instructions(uuid), public.finance_summary(date, date, uuid),
  public.save_assessment(uuid, uuid, jsonb), public.publish_assessment(uuid), public.delete_assessment_draft(uuid),
  public.save_goal(uuid, uuid, jsonb),
  public.save_match(uuid, uuid, jsonb), public.delete_match(uuid),
  public.add_match_comment(uuid, text), public.update_match_comment(uuid, text), public.match_stats(uuid, date, date),
  public.mark_notifications_read(uuid[]),
  public.create_privacy_request(uuid, public.privacy_request_kind, text),
  public.resolve_privacy_request(uuid, public.privacy_request_status, text),
  public.export_student_data(uuid), public.anonymize_student(uuid, text),
  public.job_health()
to authenticated;

-- RPCs exclusivas do servidor (service role): nunca expostas ao cliente.
grant execute on function
  public.bootstrap_coach(text, uuid, text), public.consume_rate_limit(text, int, int),
  public.invitation_preview(text), public.invitation_email_for_code(text), public.invitation_email(text),
  public.complete_payment_submission_upload(uuid, public.scan_status, text, text, int, int, int),
  public.fail_payment_submission_upload(uuid, text), public.set_file_scan_result(uuid, public.scan_status, text),
  public.mark_file_deleted(uuid, text), public.run_jobs_now(text)
to service_role;
