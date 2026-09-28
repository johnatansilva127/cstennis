
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "access_overrides": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["override_kind"],"organization_id": string,"reason": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"starts_at": string,"student_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["override_kind"],"organization_id": string,"reason": string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"starts_at"?: string,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["override_kind"],"organization_id"?: string,"reason"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"starts_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_overrides_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"access_policies": {
                  Row: {
                    "grace_days": number,"id": string,"mode": Database["public"]['Enums']["restriction_mode"],"organization_id": string,"student_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "grace_days"?: number,"id"?: string,"mode"?: Database["public"]['Enums']["restriction_mode"],"organization_id": string,"student_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "grace_days"?: number,"id"?: string,"mode"?: Database["public"]['Enums']["restriction_mode"],"organization_id"?: string,"student_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_policies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_policies_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"assessment_private_notes": {
                  Row: {
                    "assessment_id": string,"note": string,"organization_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "assessment_id": string,"note": string,"organization_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "assessment_id"?: string,"note"?: string,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_private_notes_organization_id_assessment_id_fkey"
      columns: ["organization_id","assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"assessment_scores": {
                  Row: {
                    "assessment_id": string,"comment": string | null,"organization_id": string,"score": number | null,"skill": Database["public"]['Enums']["tennis_skill"]
                  }
                  Insert: {
                    "assessment_id": string,"comment"?: string | null,"organization_id": string,"score"?: number | null,"skill": Database["public"]['Enums']["tennis_skill"]
                  }
                  Update: {
                    "assessment_id"?: string,"comment"?: string | null,"organization_id"?: string,"score"?: number | null,"skill"?: Database["public"]['Enums']["tennis_skill"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_scores_organization_id_assessment_id_fkey"
      columns: ["organization_id","assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"assessments": {
                  Row: {
                    "assessed_on": string,"created_at": string,"created_by": string,"id": string,"organization_id": string,"published_at": string | null,"published_by": string | null,"status": Database["public"]['Enums']["assessment_status"],"student_id": string,"summary": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "assessed_on": string,"created_at"?: string,"created_by": string,"id"?: string,"organization_id": string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["assessment_status"],"student_id": string,"summary"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "assessed_on"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["assessment_status"],"student_id"?: string,"summary"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessments_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "id": string,"marked_at": string,"marked_by": string | null,"occurrence_id": string,"organization_id": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "id"?: string,"marked_at"?: string,"marked_by"?: string | null,"occurrence_id": string,"organization_id": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "id"?: string,"marked_at"?: string,"marked_by"?: string | null,"occurrence_id"?: string,"organization_id"?: string,"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_organization_id_occurrence_id_fkey"
      columns: ["organization_id","occurrence_id"]
isOneToOne: false
      referencedRelation: "lesson_occurrences"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "attendance_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_role": string,"actor_user_id": string | null,"created_at": string,"diff": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": number,"organization_id": string | null,"student_id": string | null
                  }
                  Insert: {
                    "action": string,"actor_role": string,"actor_user_id"?: string | null,"created_at"?: string,"diff"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: never,"organization_id"?: string | null,"student_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_role"?: string,"actor_user_id"?: string | null,"created_at"?: string,"diff"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"organization_id"?: string | null,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"courts": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"location_id": string,"name": string,"organization_id": string,"surface": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"location_id": string,"name": string,"organization_id": string,"surface"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"location_id"?: string,"name"?: string,"organization_id"?: string,"surface"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "courts_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"enrollment_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"desired_start": string,"enrollment_id": string | null,"id": string,"message": string | null,"organization_id": string,"requested_by": string,"series_id": string,"series_root_id": string,"status": Database["public"]['Enums']["request_status"],"student_id": string
                  }
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"desired_start": string,"enrollment_id"?: string | null,"id"?: string,"message"?: string | null,"organization_id": string,"requested_by": string,"series_id": string,"series_root_id": string,"status"?: Database["public"]['Enums']["request_status"],"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"desired_start"?: string,"enrollment_id"?: string | null,"id"?: string,"message"?: string | null,"organization_id"?: string,"requested_by"?: string,"series_id"?: string,"series_root_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollment_requests_organization_id_enrollment_id_fkey"
      columns: ["organization_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "enrollment_requests_organization_id_series_id_fkey"
      columns: ["organization_id","series_id"]
isOneToOne: false
      referencedRelation: "recurring_slots"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "enrollment_requests_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"end_reason": string | null,"ended_at": string | null,"ended_by": string | null,"id": string,"organization_id": string,"request_id": string | null,"series_id": string,"series_root_id": string,"source": Database["public"]['Enums']["enrollment_source"],"status": Database["public"]['Enums']["enrollment_status"],"student_id": string,"valid_from": string,"valid_until": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"organization_id": string,"request_id"?: string | null,"series_id": string,"series_root_id": string,"source"?: Database["public"]['Enums']["enrollment_source"],"status"?: Database["public"]['Enums']["enrollment_status"],"student_id": string,"valid_from": string,"valid_until"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"organization_id"?: string,"request_id"?: string | null,"series_id"?: string,"series_root_id"?: string,"source"?: Database["public"]['Enums']["enrollment_source"],"status"?: Database["public"]['Enums']["enrollment_status"],"student_id"?: string,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_organization_id_series_id_fkey"
      columns: ["organization_id","series_id"]
isOneToOne: false
      referencedRelation: "recurring_slots"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "enrollments_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"file_objects": {
                  Row: {
                    "bucket": string,"created_at": string,"deleted_at": string | null,"deleted_reason": string | null,"detected_type": string,"id": string,"image_height": number | null,"image_width": number | null,"mime_type": string,"object_path": string,"organization_id": string,"purpose": string,"scan_engine": string | null,"scan_status": Database["public"]['Enums']["scan_status"],"scanned_at": string | null,"sha256": string | null,"size_bytes": number,"status": Database["public"]['Enums']["file_status"],"uploaded_by": string | null
                  }
                  Insert: {
                    "bucket": string,"created_at"?: string,"deleted_at"?: string | null,"deleted_reason"?: string | null,"detected_type": string,"id"?: string,"image_height"?: number | null,"image_width"?: number | null,"mime_type": string,"object_path": string,"organization_id": string,"purpose": string,"scan_engine"?: string | null,"scan_status"?: Database["public"]['Enums']["scan_status"],"scanned_at"?: string | null,"sha256"?: string | null,"size_bytes": number,"status"?: Database["public"]['Enums']["file_status"],"uploaded_by"?: string | null
                  }
                  Update: {
                    "bucket"?: string,"created_at"?: string,"deleted_at"?: string | null,"deleted_reason"?: string | null,"detected_type"?: string,"id"?: string,"image_height"?: number | null,"image_width"?: number | null,"mime_type"?: string,"object_path"?: string,"organization_id"?: string,"purpose"?: string,"scan_engine"?: string | null,"scan_status"?: Database["public"]['Enums']["scan_status"],"scanned_at"?: string | null,"sha256"?: string | null,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_objects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "achieved_at": string | null,"created_at": string,"created_by": string,"description": string,"id": string,"organization_id": string,"status": Database["public"]['Enums']["goal_status"],"student_id": string,"target_date": string | null,"updated_at": string,"updated_by": string | null,"visible_to_student": boolean
                  }
                  Insert: {
                    "achieved_at"?: string | null,"created_at"?: string,"created_by": string,"description": string,"id"?: string,"organization_id": string,"status"?: Database["public"]['Enums']["goal_status"],"student_id": string,"target_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"visible_to_student"?: boolean
                  }
                  Update: {
                    "achieved_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"organization_id"?: string,"status"?: Database["public"]['Enums']["goal_status"],"student_id"?: string,"target_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"visible_to_student"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"guardian_student_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"guardian_id": string,"id": string,"organization_id": string,"relationship": string | null,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"student_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"guardian_id": string,"id"?: string,"organization_id": string,"relationship"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"guardian_id"?: string,"id"?: string,"organization_id"?: string,"relationship"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardian_student_links_organization_id_guardian_id_fkey"
      columns: ["organization_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "guardian_student_links_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"organization_id": string,"phone": string | null,"status": Database["public"]['Enums']["guardian_status"],"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"organization_id": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["guardian_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"organization_id"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["guardian_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"codes_sent": number,"created_at": string,"created_by": string | null,"email": string,"expires_at": string,"failed_attempts": number,"guardian_id": string | null,"id": string,"kind": Database["public"]['Enums']["invitation_kind"],"organization_id": string,"revoked_at": string | null,"revoked_by": string | null,"status": Database["public"]['Enums']["invitation_status"],"student_id": string | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"codes_sent"?: number,"created_at"?: string,"created_by"?: string | null,"email": string,"expires_at": string,"failed_attempts"?: number,"guardian_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["invitation_kind"],"organization_id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"student_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"codes_sent"?: number,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string,"failed_attempts"?: number,"guardian_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["invitation_kind"],"organization_id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_organization_id_guardian_id_fkey"
      columns: ["organization_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "invitations_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "adjusted_at": string | null,"adjusted_by": string | null,"adjustment_reason": string | null,"amount_cents": number,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"competence": string,"created_at": string,"created_by": string | null,"due_date": string,"generated_by": string,"id": string,"organization_id": string,"original_amount_cents": number,"paid_at": string | null,"status": Database["public"]['Enums']["invoice_status"],"student_id": string,"tuition_term_id": string | null
                  }
                  Insert: {
                    "adjusted_at"?: string | null,"adjusted_by"?: string | null,"adjustment_reason"?: string | null,"amount_cents": number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"competence": string,"created_at"?: string,"created_by"?: string | null,"due_date": string,"generated_by": string,"id"?: string,"organization_id": string,"original_amount_cents": number,"paid_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"student_id": string,"tuition_term_id"?: string | null
                  }
                  Update: {
                    "adjusted_at"?: string | null,"adjusted_by"?: string | null,"adjustment_reason"?: string | null,"amount_cents"?: number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"competence"?: string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string,"generated_by"?: string,"id"?: string,"organization_id"?: string,"original_amount_cents"?: number,"paid_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"student_id"?: string,"tuition_term_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "invoices_organization_id_tuition_term_id_fkey"
      columns: ["organization_id","tuition_term_id"]
isOneToOne: false
      referencedRelation: "tuition_terms"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"lesson_occurrences": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"capacity": number,"completed_at": string | null,"completed_by": string | null,"court_id": string | null,"created_at": string,"duration_minutes": number,"ends_at": string,"exception_note": string | null,"format": Database["public"]['Enums']["lesson_format"],"id": string,"is_exception": boolean,"local_date": string,"location_id": string,"organization_id": string,"original_date": string,"series_id": string,"series_root_id": string,"start_time": string,"starts_at": string,"status": Database["public"]['Enums']["occurrence_status"],"travel_buffer_minutes": number,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity": number,"completed_at"?: string | null,"completed_by"?: string | null,"court_id"?: string | null,"created_at"?: string,"duration_minutes": number,"ends_at": string,"exception_note"?: string | null,"format": Database["public"]['Enums']["lesson_format"],"id"?: string,"is_exception"?: boolean,"local_date": string,"location_id": string,"organization_id": string,"original_date": string,"series_id": string,"series_root_id": string,"start_time": string,"starts_at": string,"status"?: Database["public"]['Enums']["occurrence_status"],"travel_buffer_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity"?: number,"completed_at"?: string | null,"completed_by"?: string | null,"court_id"?: string | null,"created_at"?: string,"duration_minutes"?: number,"ends_at"?: string,"exception_note"?: string | null,"format"?: Database["public"]['Enums']["lesson_format"],"id"?: string,"is_exception"?: boolean,"local_date"?: string,"location_id"?: string,"organization_id"?: string,"original_date"?: string,"series_id"?: string,"series_root_id"?: string,"start_time"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["occurrence_status"],"travel_buffer_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_occurrences_location_id_court_id_fkey"
      columns: ["location_id","court_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["location_id","id"]
    },{
      foreignKeyName: "lesson_occurrences_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "lesson_occurrences_organization_id_series_id_fkey"
      columns: ["organization_id","series_id"]
isOneToOne: false
      referencedRelation: "recurring_slots"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "active": boolean,"address": string | null,"created_at": string,"id": string,"instructions": string | null,"name": string,"organization_id": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"instructions"?: string | null,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"instructions"?: string | null,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"match_coach_comments": {
                  Row: {
                    "author_user_id": string,"body": string,"created_at": string,"id": string,"match_id": string,"organization_id": string,"updated_at": string
                  }
                  Insert: {
                    "author_user_id": string,"body": string,"created_at"?: string,"id"?: string,"match_id": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "author_user_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"match_id"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_coach_comments_organization_id_match_id_fkey"
      columns: ["organization_id","match_id"]
isOneToOne: false
      referencedRelation: "student_matches"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"match_sets": {
                  Row: {
                    "is_match_tiebreak": boolean,"match_id": string,"opponent_games": number,"organization_id": string,"player_games": number,"set_number": number,"tiebreak_opponent": number | null,"tiebreak_player": number | null
                  }
                  Insert: {
                    "is_match_tiebreak"?: boolean,"match_id": string,"opponent_games": number,"organization_id": string,"player_games": number,"set_number": number,"tiebreak_opponent"?: number | null,"tiebreak_player"?: number | null
                  }
                  Update: {
                    "is_match_tiebreak"?: boolean,"match_id"?: string,"opponent_games"?: number,"organization_id"?: string,"player_games"?: number,"set_number"?: number,"tiebreak_opponent"?: number | null,"tiebreak_player"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_sets_organization_id_match_id_fkey"
      columns: ["organization_id","match_id"]
isOneToOne: false
      referencedRelation: "student_matches"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"category": string,"created_at": string,"event_id": number,"id": string,"link_path": string | null,"organization_id": string,"read_at": string | null,"recipient_user_id": string,"student_id": string | null,"title": string
                  }
                  Insert: {
                    "body": string,"category": string,"created_at"?: string,"event_id": number,"id"?: string,"link_path"?: string | null,"organization_id": string,"read_at"?: string | null,"recipient_user_id": string,"student_id"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string,"category"?: string,"created_at"?: string,"event_id"?: number,"id"?: string,"link_path"?: string | null,"organization_id"?: string,"read_at"?: string | null,"recipient_user_id"?: string,"student_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_memberships": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["membership_role"],"status": Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["membership_role"],"status"?: Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["membership_role"],"status"?: Database["public"]['Enums']["membership_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "contact_info": string | null,"created_at": string,"default_travel_buffer_minutes": number,"due_soon_days": number,"id": string,"invitation_ttl_hours": number,"invoice_lead_days": number,"lesson_reminder_hours": number,"name": string,"occurrence_window_days": number,"privacy_contact": string | null,"privacy_controller": string | null,"proof_retention_days": number | null,"timezone": string
                  }
                  Insert: {
                    "contact_info"?: string | null,"created_at"?: string,"default_travel_buffer_minutes"?: number,"due_soon_days"?: number,"id"?: string,"invitation_ttl_hours"?: number,"invoice_lead_days"?: number,"lesson_reminder_hours"?: number,"name": string,"occurrence_window_days"?: number,"privacy_contact"?: string | null,"privacy_controller"?: string | null,"proof_retention_days"?: number | null,"timezone"?: string
                  }
                  Update: {
                    "contact_info"?: string | null,"created_at"?: string,"default_travel_buffer_minutes"?: number,"due_soon_days"?: number,"id"?: string,"invitation_ttl_hours"?: number,"invoice_lead_days"?: number,"lesson_reminder_hours"?: number,"name"?: string,"occurrence_window_days"?: number,"privacy_contact"?: string | null,"privacy_controller"?: string | null,"proof_retention_days"?: number | null,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_reversals": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"organization_id": string,"payment_id": string,"reason": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"organization_id": string,"payment_id": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"organization_id"?: string,"payment_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_reversals_organization_id_payment_id_fkey"
      columns: ["organization_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"payment_submissions": {
                  Row: {
                    "created_at": string,"file_id": string,"id": string,"invoice_id": string,"organization_id": string,"payer_note": string | null,"received_at": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["submission_status"],"student_id": string,"submitted_by": string
                  }
                  Insert: {
                    "created_at"?: string,"file_id": string,"id"?: string,"invoice_id": string,"organization_id": string,"payer_note"?: string | null,"received_at"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"student_id": string,"submitted_by": string
                  }
                  Update: {
                    "created_at"?: string,"file_id"?: string,"id"?: string,"invoice_id"?: string,"organization_id"?: string,"payer_note"?: string | null,"received_at"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"student_id"?: string,"submitted_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_submissions_organization_id_file_id_fkey"
      columns: ["organization_id","file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payment_submissions_organization_id_invoice_id_fkey"
      columns: ["organization_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payment_submissions_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string,"id": string,"idempotency_key": string | null,"invoice_id": string,"justification": string | null,"method": Database["public"]['Enums']["payment_method"],"organization_id": string,"paid_on": string,"reversed_at": string | null,"source": Database["public"]['Enums']["payment_source"],"student_id": string,"submission_id": string | null
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by": string,"id"?: string,"idempotency_key"?: string | null,"invoice_id": string,"justification"?: string | null,"method": Database["public"]['Enums']["payment_method"],"organization_id": string,"paid_on": string,"reversed_at"?: string | null,"source": Database["public"]['Enums']["payment_source"],"student_id": string,"submission_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string,"id"?: string,"idempotency_key"?: string | null,"invoice_id"?: string,"justification"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"organization_id"?: string,"paid_on"?: string,"reversed_at"?: string | null,"source"?: Database["public"]['Enums']["payment_source"],"student_id"?: string,"submission_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_organization_id_invoice_id_fkey"
      columns: ["organization_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payments_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payments_organization_id_submission_id_fkey"
      columns: ["organization_id","submission_id"]
isOneToOne: false
      referencedRelation: "payment_submissions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"pix_settings": {
                  Row: {
                    "brcode_enabled": boolean,"city": string,"key_type": Database["public"]['Enums']["pix_key_type"],"organization_id": string,"pix_key": string,"receiver_name": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "brcode_enabled"?: boolean,"city"?: string,"key_type": Database["public"]['Enums']["pix_key_type"],"organization_id": string,"pix_key": string,"receiver_name": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "brcode_enabled"?: boolean,"city"?: string,"key_type"?: Database["public"]['Enums']["pix_key_type"],"organization_id"?: string,"pix_key"?: string,"receiver_name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pix_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"privacy_requests": {
                  Row: {
                    "created_at": string,"details": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"kind": Database["public"]['Enums']["privacy_request_kind"],"organization_id": string,"requested_by": string,"resolution": string | null,"status": Database["public"]['Enums']["privacy_request_status"],"student_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["privacy_request_kind"],"organization_id": string,"requested_by": string,"resolution"?: string | null,"status"?: Database["public"]['Enums']["privacy_request_status"],"student_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["privacy_request_kind"],"organization_id"?: string,"requested_by"?: string,"resolution"?: string | null,"status"?: Database["public"]['Enums']["privacy_request_status"],"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "privacy_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "privacy_requests_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"recurring_slots": {
                  Row: {
                    "capacity": number,"court_id": string | null,"created_at": string,"created_by": string | null,"duration_minutes": number,"format": Database["public"]['Enums']["lesson_format"],"id": string,"level": string | null,"location_id": string,"organization_id": string,"previous_version_id": string | null,"series_root_id": string,"start_time": string,"title": string | null,"travel_buffer_minutes": number,"valid_from": string,"valid_until": string | null,"weekday": number
                  }
                  Insert: {
                    "capacity": number,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_minutes": number,"format": Database["public"]['Enums']["lesson_format"],"id"?: string,"level"?: string | null,"location_id": string,"organization_id": string,"previous_version_id"?: string | null,"series_root_id": string,"start_time": string,"title"?: string | null,"travel_buffer_minutes"?: number,"valid_from": string,"valid_until"?: string | null,"weekday": number
                  }
                  Update: {
                    "capacity"?: number,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_minutes"?: number,"format"?: Database["public"]['Enums']["lesson_format"],"id"?: string,"level"?: string | null,"location_id"?: string,"organization_id"?: string,"previous_version_id"?: string | null,"series_root_id"?: string,"start_time"?: string,"title"?: string | null,"travel_buffer_minutes"?: number,"valid_from"?: string,"valid_until"?: string | null,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_slots_location_id_court_id_fkey"
      columns: ["location_id","court_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["location_id","id"]
    },{
      foreignKeyName: "recurring_slots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_slots_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "recurring_slots_previous_version_id_fkey"
      columns: ["previous_version_id"]
isOneToOne: false
      referencedRelation: "recurring_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"student_matches": {
                  Row: {
                    "author_kind": string,"comments": string | null,"created_at": string,"created_by": string,"event_name": string | null,"format": Database["public"]['Enums']["match_format"],"id": string,"match_type": Database["public"]['Enums']["match_type"],"opponent_name": string,"opponent2_name": string | null,"organization_id": string,"outcome": Database["public"]['Enums']["match_outcome"],"outcome_source": string,"partner_name": string | null,"played_on": string,"student_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "author_kind": string,"comments"?: string | null,"created_at"?: string,"created_by": string,"event_name"?: string | null,"format": Database["public"]['Enums']["match_format"],"id"?: string,"match_type"?: Database["public"]['Enums']["match_type"],"opponent_name": string,"opponent2_name"?: string | null,"organization_id": string,"outcome": Database["public"]['Enums']["match_outcome"],"outcome_source": string,"partner_name"?: string | null,"played_on": string,"student_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "author_kind"?: string,"comments"?: string | null,"created_at"?: string,"created_by"?: string,"event_name"?: string | null,"format"?: Database["public"]['Enums']["match_format"],"id"?: string,"match_type"?: Database["public"]['Enums']["match_type"],"opponent_name"?: string,"opponent2_name"?: string | null,"organization_id"?: string,"outcome"?: Database["public"]['Enums']["match_outcome"],"outcome_source"?: string,"partner_name"?: string | null,"played_on"?: string,"student_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_matches_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"student_private_notes": {
                  Row: {
                    "note": string,"organization_id": string,"student_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "note"?: string,"organization_id": string,"student_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "note"?: string,"organization_id"?: string,"student_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_private_notes_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"student_status_changes": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effective_date": string,"id": string,"organization_id": string,"reason": string | null,"status": Database["public"]['Enums']["student_status"],"student_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effective_date": string,"id"?: string,"organization_id": string,"reason"?: string | null,"status": Database["public"]['Enums']["student_status"],"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effective_date"?: string,"id"?: string,"organization_id"?: string,"reason"?: string | null,"status"?: Database["public"]['Enums']["student_status"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_status_changes_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"student_user_links": {
                  Row: {
                    "created_at": string,"id": string,"invitation_id": string | null,"organization_id": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"student_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"invitation_id"?: string | null,"organization_id": string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invitation_id"?: string | null,"organization_id"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"student_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_user_links_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"students": {
                  Row: {
                    "anonymized_at": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"kind": Database["public"]['Enums']["student_kind"],"level": string | null,"organization_id": string,"phone": string | null,"status": Database["public"]['Enums']["student_status"],"status_effective_date": string,"updated_at": string
                  }
                  Insert: {
                    "anonymized_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"kind": Database["public"]['Enums']["student_kind"],"level"?: string | null,"organization_id": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["student_status"],"status_effective_date"?: string,"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["student_kind"],"level"?: string | null,"organization_id"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["student_status"],"status_effective_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tuition_terms": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"due_day": number,"ends_month": string | null,"id": string,"notes": string | null,"organization_id": string,"starts_month": string,"student_id": string
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"due_day": number,"ends_month"?: string | null,"id"?: string,"notes"?: string | null,"organization_id": string,"starts_month": string,"student_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"due_day"?: number,"ends_month"?: string | null,"id"?: string,"notes"?: string | null,"organization_id"?: string,"starts_month"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tuition_terms_organization_id_student_id_fkey"
      columns: ["organization_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"unavailability_periods": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"location_id": string | null,"organization_id": string,"reason": string,"starts_on": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"location_id"?: string | null,"organization_id": string,"reason": string,"starts_on": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"location_id"?: string | null,"organization_id"?: string,"reason"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unavailability_periods_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unavailability_periods_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"user_profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"theme_preference": Database["public"]['Enums']["theme_preference"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"full_name"?: string,"theme_preference"?: Database["public"]['Enums']["theme_preference"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"theme_preference"?: Database["public"]['Enums']["theme_preference"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"add_match_comment":
{ Args: { "p_body": string,"p_match_id": string }; Returns: string
                           },
"adjust_invoice":
{ Args: { "p_amount_cents": number,"p_due_date": string,"p_invoice_id": string,"p_reason": string }; Returns: undefined
                           },
"anonymize_student":
{ Args: { "p_reason": string,"p_student_id": string }; Returns: Json
                           },
"attendance_summary":
{ Args: { "p_from": string,"p_student_id": string,"p_to": string }; Returns: Json
                           },
"authorize_file_download":
{ Args: { "p_file_id": string }; Returns: Json
                           },
"authorize_password_link":
{ Args: { "p_kind": Database["public"]['Enums']["invitation_kind"],"p_target_id": string }; Returns: string
                           },
"begin_payment_submission":
{ Args: { "p_detected_type": string,"p_height"?: number,"p_invoice_id": string,"p_mime_type": string,"p_note"?: string,"p_sha256": string,"p_size_bytes": number,"p_width"?: number }; Returns: Json
                           },
"bootstrap_coach":
{ Args: { "p_org_name": string,"p_timezone"?: string,"p_user_id": string }; Returns: string
                           },
"cancel_enrollment_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"cancel_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_occurrence":
{ Args: { "p_occurrence_id": string,"p_reason": string }; Returns: undefined
                           },
"coach_agenda":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "cancel_reason": string,"capacity": number,"court_name": string,"duration_minutes": number,"enrolled": number,"format": Database["public"]['Enums']["lesson_format"],"is_exception": boolean,"local_date": string,"location_id": string,"location_name": string,"marked": number,"occurrence_id": string,"series_id": string,"series_root_id": string,"start_time": string,"starts_at": string,"status": Database["public"]['Enums']["occurrence_status"],"title": string
            }[]
                           },
"complete_payment_submission_upload":
{ Args: { "p_file_id": string,"p_height"?: number,"p_scan_engine": string,"p_scan_status": Database["public"]['Enums']["scan_status"],"p_sha256"?: string,"p_size_bytes"?: number,"p_width"?: number }; Returns: string
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_access_override":
{ Args: { "p_expires_at"?: string,"p_kind": Database["public"]['Enums']["override_kind"],"p_reason": string,"p_student_id": string }; Returns: string
                           },
"create_enrollment":
{ Args: { "p_series_id": string,"p_student_id": string,"p_valid_from": string,"p_valid_until"?: string }; Returns: string
                           },
"create_guardian":
{ Args: { "p_payload": Json }; Returns: string
                           },
"create_invitation":
{ Args: { "p_email"?: string,"p_kind": Database["public"]['Enums']["invitation_kind"],"p_target_id": string }; Returns: Json
                           },
"create_manual_invoice":
{ Args: { "p_amount_cents": number,"p_competence": string,"p_due_date": string,"p_reason": string,"p_student_id": string }; Returns: string
                           },
"create_privacy_request":
{ Args: { "p_details": string,"p_kind": Database["public"]['Enums']["privacy_request_kind"],"p_student_id": string }; Returns: string
                           },
"create_series":
{ Args: { "p_payload": Json }; Returns: string
                           },
"create_student":
{ Args: { "p_payload": Json }; Returns: Json
                           },
"create_unavailability":
{ Args: { "p_ends_on": string,"p_location_id": string,"p_reason": string,"p_starts_on": string }; Returns: string
                           },
"decide_enrollment_request":
{ Args: { "p_approve": boolean,"p_override_restriction"?: boolean,"p_reason"?: string,"p_request_id": string,"p_valid_from"?: string }; Returns: string
                           },
"delete_assessment_draft":
{ Args: { "p_assessment_id": string }; Returns: undefined
                           },
"delete_match":
{ Args: { "p_match_id": string }; Returns: undefined
                           },
"end_enrollment":
{ Args: { "p_enrollment_id": string,"p_last_date": string,"p_reason": string }; Returns: undefined
                           },
"end_series":
{ Args: { "p_last_date": string,"p_reason": string,"p_series_id": string }; Returns: undefined
                           },
"end_tuition_term":
{ Args: { "p_ends_month": string,"p_term_id": string }; Returns: undefined
                           },
"export_student_data":
{ Args: { "p_student_id": string }; Returns: Json
                           },
"fail_payment_submission_upload":
{ Args: { "p_file_id": string,"p_reason": string }; Returns: undefined
                           },
"finance_summary":
{ Args: { "p_from_month": string,"p_student_id"?: string,"p_to_month": string }; Returns: Json
                           },
"generate_invoices_now":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"invitation_email":
{ Args: { "p_token": string }; Returns: string
                           },
"invitation_email_for_code":
{ Args: { "p_token": string }; Returns: string
                           },
"invitation_preview":
{ Args: { "p_token": string }; Returns: Json
                           },
"job_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"link_guardian_student":
{ Args: { "p_guardian_id": string,"p_relationship"?: string,"p_student_id": string }; Returns: string
                           },
"list_available_slots":
{ Args: { "p_student_id": string }; Returns: {
              "already_enrolled": boolean,"capacity": number,"court_name": string,"duration_minutes": number,"format": Database["public"]['Enums']["lesson_format"],"free_spots": number,"level": string,"location_address": string,"location_name": string,"next_date": string,"pending_request": boolean,"series_id": string,"start_time": string,"title": string,"weekday": number
            }[]
                           },
"mark_file_deleted":
{ Args: { "p_file_id": string,"p_reason": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"match_stats":
{ Args: { "p_from": string,"p_student_id": string,"p_to": string }; Returns: Json
                           },
"my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"occurrence_attendance":
{ Args: { "p_occurrence_id": string }; Returns: {
              "full_name": string,"marked_at": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at": string
            }[]
                           },
"organization_public_info":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"payment_instructions":
{ Args: { "p_invoice_id": string }; Returns: Json
                           },
"preview_series_change":
{ Args: { "p_effective_date": string,"p_payload": Json,"p_series_id": string }; Returns: Json
                           },
"publish_assessment":
{ Args: { "p_assessment_id": string }; Returns: undefined
                           },
"record_manual_payment":
{ Args: { "p_amount_cents": number,"p_idempotency_key"?: string,"p_invoice_id": string,"p_justification": string,"p_method": Database["public"]['Enums']["payment_method"],"p_paid_on": string }; Returns: string
                           },
"request_enrollment":
{ Args: { "p_desired_start"?: string,"p_message"?: string,"p_series_id": string,"p_student_id": string }; Returns: string
                           },
"resolve_privacy_request":
{ Args: { "p_request_id": string,"p_resolution": string,"p_status": Database["public"]['Enums']["privacy_request_status"] }; Returns: undefined
                           },
"restore_occurrence":
{ Args: { "p_occurrence_id": string }; Returns: undefined
                           },
"reverse_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: string
                           },
"review_payment_submission":
{ Args: { "p_action": string,"p_method"?: Database["public"]['Enums']["payment_method"],"p_paid_on"?: string,"p_reason"?: string,"p_submission_id": string }; Returns: string
                           },
"revoke_access_override":
{ Args: { "p_override_id": string,"p_reason": string }; Returns: undefined
                           },
"revoke_account_access":
{ Args: { "p_kind": string,"p_reason": string,"p_target_id": string }; Returns: undefined
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"run_jobs_now":
{ Args: { "p_job": string }; Returns: Json
                           },
"save_assessment":
{ Args: { "p_assessment_id": string,"p_payload": Json,"p_student_id": string }; Returns: string
                           },
"save_attendance":
{ Args: { "p_marks": Json,"p_occurrence_id": string }; Returns: Json
                           },
"save_court":
{ Args: { "p_court_id": string,"p_location_id": string,"p_payload": Json }; Returns: string
                           },
"save_goal":
{ Args: { "p_goal_id": string,"p_payload": Json,"p_student_id": string }; Returns: string
                           },
"save_location":
{ Args: { "p_location_id": string,"p_payload": Json }; Returns: string
                           },
"save_match":
{ Args: { "p_match_id": string,"p_payload": Json,"p_student_id": string }; Returns: string
                           },
"set_access_policy":
{ Args: { "p_grace_days": number,"p_mode": Database["public"]['Enums']["restriction_mode"],"p_student_id": string }; Returns: undefined
                           },
"set_file_scan_result":
{ Args: { "p_file_id": string,"p_scan_engine": string,"p_scan_status": Database["public"]['Enums']["scan_status"] }; Returns: undefined
                           },
"set_student_private_note":
{ Args: { "p_note": string,"p_student_id": string }; Returns: undefined
                           },
"set_student_status":
{ Args: { "p_effective_date": string,"p_end_enrollments"?: boolean,"p_reason": string,"p_status": Database["public"]['Enums']["student_status"],"p_student_id": string }; Returns: undefined
                           },
"set_tuition_term":
{ Args: { "p_amount_cents": number,"p_due_day": number,"p_ends_month"?: string,"p_notes"?: string,"p_starts_month": string,"p_student_id": string }; Returns: string
                           },
"student_enrollments":
{ Args: { "p_student_id": string }; Returns: {
              "court_name": string,"duration_minutes": number,"enrollment_id": string,"format": Database["public"]['Enums']["lesson_format"],"level": string,"location_name": string,"series_root_id": string,"start_time": string,"title": string,"valid_from": string,"valid_until": string,"weekday": number
            }[]
                           },
"student_lessons":
{ Args: { "p_from": string,"p_student_id": string,"p_to": string }; Returns: {
              "attendance": Database["public"]['Enums']["attendance_status"],"cancel_reason": string,"court_name": string,"duration_minutes": number,"exception_note": string,"format": Database["public"]['Enums']["lesson_format"],"is_exception": boolean,"local_date": string,"location_address": string,"location_instructions": string,"location_name": string,"occurrence_id": string,"start_time": string,"starts_at": string,"status": Database["public"]['Enums']["occurrence_status"],"title": string
            }[]
                           },
"student_restriction":
{ Args: { "p_student_id": string }; Returns: Json
                           },
"unlink_guardian_student":
{ Args: { "p_link_id": string,"p_reason": string }; Returns: undefined
                           },
"update_guardian":
{ Args: { "p_guardian_id": string,"p_payload": Json }; Returns: undefined
                           },
"update_match_comment":
{ Args: { "p_body": string,"p_comment_id": string }; Returns: undefined
                           },
"update_my_profile":
{ Args: { "p_full_name": string,"p_theme": Database["public"]['Enums']["theme_preference"] }; Returns: undefined
                           },
"update_occurrence":
{ Args: { "p_occurrence_id": string,"p_payload": Json }; Returns: undefined
                           },
"update_organization_settings":
{ Args: { "p_settings": Json }; Returns: undefined
                           },
"update_pix_settings":
{ Args: { "p_brcode_enabled": boolean,"p_city": string,"p_key_type": Database["public"]['Enums']["pix_key_type"],"p_pix_key": string,"p_receiver_name": string }; Returns: undefined
                           },
"update_series_from":
{ Args: { "p_effective_date": string,"p_payload": Json,"p_series_id": string }; Returns: string
                           },
"update_student":
{ Args: { "p_payload": Json,"p_student_id": string }; Returns: undefined
                           },
"withdraw_payment_submission":
{ Args: { "p_submission_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "assessment_status": "draft"|"published","attendance_status": "present"|"absent"|"excused","enrollment_source": "direct"|"request"|"series_edit","enrollment_status": "active"|"cancelled","file_status": "pending_upload"|"stored"|"deleted","goal_status": "open"|"in_progress"|"achieved"|"dropped","guardian_status": "active"|"archived","invitation_kind": "student"|"guardian","invitation_status": "pending"|"accepted"|"revoked","invoice_status": "open"|"under_review"|"paid"|"cancelled","lesson_format": "individual"|"double"|"group","match_format": "best_of_3"|"best_of_3_match_tiebreak"|"best_of_5"|"single_set"|"pro_set_8"|"short_sets_best_of_3"|"custom","match_outcome": "win"|"loss"|"incomplete"|"walkover_win"|"walkover_loss"|"retired_win"|"retired_loss","match_type": "singles"|"doubles","membership_role": "coach"|"participant","membership_status": "active"|"revoked","occurrence_status": "scheduled"|"completed"|"cancelled","override_kind": "release"|"block_requests"|"restrict_modules","payment_method": "pix"|"cash"|"bank_transfer"|"other","payment_source": "submission"|"manual","pix_key_type": "cpf"|"cnpj"|"email"|"phone"|"evp","privacy_request_kind": "access"|"correction"|"export"|"deletion","privacy_request_status": "open"|"in_progress"|"completed"|"rejected","request_status": "pending"|"approved"|"rejected"|"cancelled","restriction_mode": "warn_only"|"block_requests"|"restrict_modules","scan_status": "pending"|"clean"|"infected"|"error","student_kind": "adult"|"child","student_status": "active"|"paused"|"archived","submission_status": "uploading"|"received"|"under_review"|"approved"|"rejected"|"withdrawn","tennis_skill": "forehand"|"backhand"|"serve"|"return"|"volley"|"movement"|"consistency"|"decision_making","theme_preference": "system"|"light"|"dark"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "assessment_status": ["draft", "published"],"attendance_status": ["present", "absent", "excused"],"enrollment_source": ["direct", "request", "series_edit"],"enrollment_status": ["active", "cancelled"],"file_status": ["pending_upload", "stored", "deleted"],"goal_status": ["open", "in_progress", "achieved", "dropped"],"guardian_status": ["active", "archived"],"invitation_kind": ["student", "guardian"],"invitation_status": ["pending", "accepted", "revoked"],"invoice_status": ["open", "under_review", "paid", "cancelled"],"lesson_format": ["individual", "double", "group"],"match_format": ["best_of_3", "best_of_3_match_tiebreak", "best_of_5", "single_set", "pro_set_8", "short_sets_best_of_3", "custom"],"match_outcome": ["win", "loss", "incomplete", "walkover_win", "walkover_loss", "retired_win", "retired_loss"],"match_type": ["singles", "doubles"],"membership_role": ["coach", "participant"],"membership_status": ["active", "revoked"],"occurrence_status": ["scheduled", "completed", "cancelled"],"override_kind": ["release", "block_requests", "restrict_modules"],"payment_method": ["pix", "cash", "bank_transfer", "other"],"payment_source": ["submission", "manual"],"pix_key_type": ["cpf", "cnpj", "email", "phone", "evp"],"privacy_request_kind": ["access", "correction", "export", "deletion"],"privacy_request_status": ["open", "in_progress", "completed", "rejected"],"request_status": ["pending", "approved", "rejected", "cancelled"],"restriction_mode": ["warn_only", "block_requests", "restrict_modules"],"scan_status": ["pending", "clean", "infected", "error"],"student_kind": ["adult", "child"],"student_status": ["active", "paused", "archived"],"submission_status": ["uploading", "received", "under_review", "approved", "rejected", "withdrawn"],"tennis_skill": ["forehand", "backhand", "serve", "return", "volley", "movement", "consistency", "decision_making"],"theme_preference": ["system", "light", "dark"]
          }
        }
} as const

