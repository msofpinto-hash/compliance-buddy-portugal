export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_plans: {
        Row: {
          audit_requirement_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          evidence_url: string | null
          id: string
          organization_id: string
          priority: string | null
          requirement_id: string | null
          responsible: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audit_requirement_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          organization_id: string
          priority?: string | null
          requirement_id?: string | null
          responsible?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audit_requirement_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          organization_id?: string
          priority?: string | null
          requirement_id?: string | null
          responsible?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_audit_requirement_id_fkey"
            columns: ["audit_requirement_id"]
            isOneToOne: false
            referencedRelation: "audit_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "legal_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          email_sent: boolean
          id: string
          is_read: boolean
          message: string
          organization_id: string | null
          related_action_plan_id: string | null
          related_legislation_id: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message: string
          organization_id?: string | null
          related_action_plan_id?: string | null
          related_legislation_id?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string | null
          related_action_plan_id?: string | null
          related_legislation_id?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_action_plan_id_fkey"
            columns: ["related_action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_legislation_id_fkey"
            columns: ["related_legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      applicabilities: {
        Row: {
          applicability_type: string | null
          compliance_status: string | null
          created_at: string
          evidence_files: string[] | null
          id: string
          is_applicable: boolean
          notes: string | null
          organization_id: string
          requirement_id: string
          updated_at: string
        }
        Insert: {
          applicability_type?: string | null
          compliance_status?: string | null
          created_at?: string
          evidence_files?: string[] | null
          id?: string
          is_applicable?: boolean
          notes?: string | null
          organization_id: string
          requirement_id: string
          updated_at?: string
        }
        Update: {
          applicability_type?: string | null
          compliance_status?: string | null
          created_at?: string
          evidence_files?: string[] | null
          id?: string
          is_applicable?: boolean
          notes?: string | null
          organization_id?: string
          requirement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicabilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicabilities_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "legal_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_requirement_documents: {
        Row: {
          audit_requirement_id: string
          created_at: string
          document_id: string
          id: string
        }
        Insert: {
          audit_requirement_id: string
          created_at?: string
          document_id: string
          id?: string
        }
        Update: {
          audit_requirement_id?: string
          created_at?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_requirement_documents_audit_requirement_id_fkey"
            columns: ["audit_requirement_id"]
            isOneToOne: false
            referencedRelation: "audit_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_requirement_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_requirements: {
        Row: {
          applicability_type: string
          audit_id: string
          compliance_status: string | null
          created_at: string
          evidence: string | null
          findings: string | null
          id: string
          legislation_id: string
          requirement_id: string
          updated_at: string
        }
        Insert: {
          applicability_type: string
          audit_id: string
          compliance_status?: string | null
          created_at?: string
          evidence?: string | null
          findings?: string | null
          id?: string
          legislation_id: string
          requirement_id: string
          updated_at?: string
        }
        Update: {
          applicability_type?: string
          audit_id?: string
          compliance_status?: string | null
          created_at?: string
          evidence?: string | null
          findings?: string | null
          id?: string
          legislation_id?: string
          requirement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_requirements_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_requirements_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_requirements_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "legal_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audit_date: string | null
          auditor: string | null
          created_at: string
          created_by: string | null
          description: string | null
          executive_summary: string | null
          findings: string | null
          id: string
          interlocutors: string | null
          methodology: string | null
          objectives: string | null
          organization_id: string
          plan_approved_at: string | null
          plan_approved_by: string | null
          plan_feedback: string | null
          recommendations: string | null
          scope: string | null
          status: Database["public"]["Enums"]["audit_status"]
          strengths: string | null
          title: string
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audit_date?: string | null
          auditor?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          executive_summary?: string | null
          findings?: string | null
          id?: string
          interlocutors?: string | null
          methodology?: string | null
          objectives?: string | null
          organization_id: string
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          plan_feedback?: string | null
          recommendations?: string | null
          scope?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          strengths?: string | null
          title: string
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audit_date?: string | null
          auditor?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          executive_summary?: string | null
          findings?: string | null
          id?: string
          interlocutors?: string | null
          methodology?: string | null
          objectives?: string | null
          organization_id?: string
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          plan_feedback?: string | null
          recommendations?: string | null
          scope?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          strengths?: string | null
          title?: string
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      category_theme_links: {
        Row: {
          category_id: string
          created_at: string
          id: string
          theme_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          theme_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_theme_links_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "theme_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_theme_links_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_change_requests: {
        Row: {
          applicability_id: string
          created_at: string
          id: string
          organization_id: string
          proposed_applicability_type: string | null
          proposed_compliance_status: string | null
          proposed_evidence_files: string[] | null
          proposed_notes: string | null
          request_reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicability_id: string
          created_at?: string
          id?: string
          organization_id: string
          proposed_applicability_type?: string | null
          proposed_compliance_status?: string | null
          proposed_evidence_files?: string[] | null
          proposed_notes?: string | null
          request_reason?: string | null
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicability_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          proposed_applicability_type?: string | null
          proposed_compliance_status?: string | null
          proposed_evidence_files?: string[] | null
          proposed_notes?: string | null
          request_reason?: string | null
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_change_requests_applicability_id_fkey"
            columns: ["applicability_id"]
            isOneToOne: false
            referencedRelation: "applicabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_document_versions: {
        Row: {
          created_at: string
          document_type: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          organization_id: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          organization_id: string
          uploaded_by?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          organization_id?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          uploaded_by: string | null
          user_notes: string | null
          validity_date: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          uploaded_by?: string | null
          user_notes?: string | null
          validity_date?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          uploaded_by?: string | null
          user_notes?: string | null
          validity_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_request_documents: {
        Row: {
          created_at: string
          document_id: string
          id: string
          request_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          request_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          request_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_request_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_request_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "organization_evidence_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_template_legislation: {
        Row: {
          created_at: string
          id: string
          legislation_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          legislation_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          legislation_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_template_legislation_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_template_legislation_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evidence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_templates: {
        Row: {
          area_ambiente: boolean | null
          area_conciliacao: boolean | null
          area_energia: boolean | null
          area_florestas: boolean | null
          area_qualidade: boolean | null
          area_saude: boolean | null
          area_seguranca: boolean | null
          area_seguranca_alimentar: boolean | null
          area_sustentabilidade: boolean | null
          created_at: string
          created_by: string | null
          description: string | null
          group_name: string
          id: string
          legislation_references: string | null
          title: string
          updated_at: string
        }
        Insert: {
          area_ambiente?: boolean | null
          area_conciliacao?: boolean | null
          area_energia?: boolean | null
          area_florestas?: boolean | null
          area_qualidade?: boolean | null
          area_saude?: boolean | null
          area_seguranca?: boolean | null
          area_seguranca_alimentar?: boolean | null
          area_sustentabilidade?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_name: string
          id?: string
          legislation_references?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          area_ambiente?: boolean | null
          area_conciliacao?: boolean | null
          area_energia?: boolean | null
          area_florestas?: boolean | null
          area_qualidade?: boolean | null
          area_saude?: boolean | null
          area_seguranca?: boolean | null
          area_seguranca_alimentar?: boolean | null
          area_sustentabilidade?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_name?: string
          id?: string
          legislation_references?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_source_status: {
        Row: {
          blocked_until: string | null
          created_at: string
          error_message: string | null
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          source_name: string
          status: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          source_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          source_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_requirements: {
        Row: {
          article: string | null
          created_at: string
          display_order: number | null
          id: string
          legislation_id: string
          notes: string | null
          requirement_text: string
          updated_at: string
        }
        Insert: {
          article?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          legislation_id: string
          notes?: string | null
          requirement_text: string
          updated_at?: string
        }
        Update: {
          article?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          legislation_id?: string
          notes?: string | null
          requirement_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_requirements_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      legislation: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          document_url: string | null
          effective_date: string | null
          entity: string | null
          external_id: string | null
          file_hash: string | null
          id: string
          no_digital_version: boolean | null
          number: string
          origin: string | null
          publication_date: string | null
          revocation_date: string | null
          source: string | null
          summary: string | null
          title: string
          updated_at: string
          uploaded_file_name: string | null
          uploaded_file_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          file_hash?: string | null
          id?: string
          no_digital_version?: boolean | null
          number: string
          origin?: string | null
          publication_date?: string | null
          revocation_date?: string | null
          source?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          uploaded_file_name?: string | null
          uploaded_file_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          file_hash?: string | null
          id?: string
          no_digital_version?: boolean | null
          number?: string
          origin?: string | null
          publication_date?: string | null
          revocation_date?: string | null
          source?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          uploaded_file_name?: string | null
          uploaded_file_url?: string | null
        }
        Relationships: []
      }
      legislation_category_mapping: {
        Row: {
          category_id: string
          created_at: string
          id: string
          legislation_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          legislation_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          legislation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legislation_category_mapping_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "theme_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legislation_category_mapping_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      legislation_processing_failures: {
        Row: {
          created_at: string
          error_details: string | null
          failed_at: string
          failure_reason: string
          failure_type: string
          id: string
          is_permanent: boolean
          legislation_id: string
          retry_after: string | null
          retry_count: number
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_details?: string | null
          failed_at?: string
          failure_reason: string
          failure_type: string
          id?: string
          is_permanent?: boolean
          legislation_id: string
          retry_after?: string | null
          retry_count?: number
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_details?: string | null
          failed_at?: string
          failure_reason?: string
          failure_type?: string
          id?: string
          is_permanent?: boolean
          legislation_id?: string
          retry_after?: string | null
          retry_count?: number
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legislation_processing_failures_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      legislation_relations: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          relation_type: string
          source_legislation_id: string
          target_legislation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          relation_type: string
          source_legislation_id: string
          target_legislation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          relation_type?: string
          source_legislation_id?: string
          target_legislation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legislation_relations_source_legislation_id_fkey"
            columns: ["source_legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legislation_relations_target_legislation_id_fkey"
            columns: ["target_legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      legislation_relations_processed: {
        Row: {
          id: string
          legislation_id: string
          processed_at: string
          relations_found: number | null
          relations_matched: number | null
        }
        Insert: {
          id?: string
          legislation_id: string
          processed_at?: string
          relations_found?: number | null
          relations_matched?: number | null
        }
        Update: {
          id?: string
          legislation_id?: string
          processed_at?: string
          relations_found?: number | null
          relations_matched?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legislation_relations_processed_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: true
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      legislation_staging: {
        Row: {
          auto_category_method: string | null
          category: string | null
          created_at: string
          document_url: string | null
          effective_date: string | null
          entity: string | null
          external_id: string | null
          fetched_at: string
          id: string
          number: string
          publication_date: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scraped_data: Json | null
          source: string
          status: string
          suggested_categories: string[] | null
          summary: string | null
          title: string
        }
        Insert: {
          auto_category_method?: string | null
          category?: string | null
          created_at?: string
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          number: string
          publication_date?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scraped_data?: Json | null
          source: string
          status?: string
          suggested_categories?: string[] | null
          summary?: string | null
          title: string
        }
        Update: {
          auto_category_method?: string | null
          category?: string | null
          created_at?: string
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          number?: string
          publication_date?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scraped_data?: Json | null
          source?: string
          status?: string
          suggested_categories?: string[] | null
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      organization_evidence_requests: {
        Row: {
          assigned_by: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_evidence_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_evidence_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evidence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_legislation: {
        Row: {
          applicability_type: string | null
          assigned_at: string
          assigned_by: string | null
          id: string
          legislation_id: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          applicability_type?: string | null
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          legislation_id: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          applicability_type?: string | null
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          legislation_id?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_legislation_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_legislation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_themes: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          organization_id: string
          theme_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          organization_id: string
          theme_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          organization_id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_themes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_themes_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          cae_principal: string | null
          cae_secundarios: string[] | null
          city: string | null
          contract_end_date: string | null
          contract_reference: string | null
          contract_start_date: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          nipc: string | null
          notes: string | null
          objeto_social: string | null
          postal_code: string | null
          proposal_url: string | null
          purchase_order_url: string | null
          responsible_email: string | null
          responsible_name: string | null
          responsible_phone: string | null
          service_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cae_principal?: string | null
          cae_secundarios?: string[] | null
          city?: string | null
          contract_end_date?: string | null
          contract_reference?: string | null
          contract_start_date?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          nipc?: string | null
          notes?: string | null
          objeto_social?: string | null
          postal_code?: string | null
          proposal_url?: string | null
          purchase_order_url?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cae_principal?: string | null
          cae_secundarios?: string[] | null
          city?: string | null
          contract_end_date?: string | null
          contract_reference?: string | null
          contract_start_date?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          nipc?: string | null
          notes?: string | null
          objeto_social?: string | null
          postal_code?: string | null
          proposal_url?: string | null
          purchase_order_url?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          calendar_type: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_approved: boolean
          language: string | null
          phone: string | null
          updated_at: string
          user_type: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          calendar_type?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_approved?: boolean
          language?: string | null
          phone?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          calendar_type?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          language?: string | null
          phone?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          function_name: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          items_added: number | null
          items_processed: number | null
          items_updated: number | null
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          items_added?: number | null
          items_processed?: number | null
          items_updated?: number | null
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          items_added?: number | null
          items_processed?: number | null
          items_updated?: number | null
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: []
      }
      theme_categories: {
        Row: {
          created_at: string
          id: string
          keywords: string[] | null
          name: string
          parent_id: string | null
          theme_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          name: string
          parent_id?: string | null
          theme_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          name?: string
          parent_id?: string | null
          theme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "theme_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_categories_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_legislation_reads: {
        Row: {
          created_at: string
          id: string
          legislation_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          legislation_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          legislation_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_legislation_reads_legislation_id_fkey"
            columns: ["legislation_id"]
            isOneToOne: false
            referencedRelation: "legislation"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          module: Database["public"]["Enums"]["app_module"]
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_login_allowed: { Args: { p_email: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_function_name: string
          p_identifier: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      count_generic_titles: { Args: never; Returns: number }
      count_short_summaries: { Args: never; Returns: number }
      get_generic_title_ids: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          document_url: string
          id: string
          number: string
          title: string
        }[]
      }
      get_legislation_with_requirements_count: { Args: never; Returns: number }
      get_legislation_without_categories_count: { Args: never; Returns: number }
      get_legislation_without_categories_ids: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_legislation_without_requirements: {
        Args: { p_limit?: number; p_origin?: string }
        Returns: {
          document_url: string
          id: string
          number: string
          origin: string
          summary: string
          title: string
        }[]
      }
      get_processable_legislation_ids: {
        Args: { p_failure_type: string; p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_short_summary_ids: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          document_url: string
          effective_date: string
          id: string
          number: string
          origin: string
          publication_date: string
          summary: string
          title: string
        }[]
      }
      get_user_modules: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_module"][]
      }
      get_user_organizations: { Args: { _user_id: string }; Returns: string[] }
      has_module_access: {
        Args: {
          _module: Database["public"]["Enums"]["app_module"]
          _org_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_source_available: { Args: { p_source_name: string }; Returns: boolean }
      record_login_attempt: {
        Args: { p_email: string; p_success: boolean }
        Returns: undefined
      }
      record_processing_failure: {
        Args: {
          p_error_details?: string
          p_failure_reason: string
          p_failure_type: string
          p_is_permanent?: boolean
          p_legislation_id: string
          p_retry_after?: string
          p_source: string
        }
        Returns: string
      }
      update_source_status: {
        Args: {
          p_block_hours?: number
          p_error_message?: string
          p_source_name: string
          p_status: string
        }
        Returns: undefined
      }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_module:
        | "legislacao"
        | "planos_acao"
        | "auditorias"
        | "documentos"
        | "indicadores"
      app_role: "admin" | "client"
      audit_status:
        | "planned"
        | "in_progress"
        | "pending_approval"
        | "closed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_module: [
        "legislacao",
        "planos_acao",
        "auditorias",
        "documentos",
        "indicadores",
      ],
      app_role: ["admin", "client"],
      audit_status: [
        "planned",
        "in_progress",
        "pending_approval",
        "closed",
        "cancelled",
      ],
    },
  },
} as const
