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
          organization_id: string
          recommendations: string | null
          status: Database["public"]["Enums"]["audit_status"]
          strengths: string | null
          title: string
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
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
          organization_id: string
          recommendations?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          strengths?: string | null
          title: string
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
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
          organization_id?: string
          recommendations?: string | null
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
      legal_requirements: {
        Row: {
          article: string | null
          created_at: string
          id: string
          legislation_id: string
          notes: string | null
          requirement_text: string
          updated_at: string
        }
        Insert: {
          article?: string | null
          created_at?: string
          id?: string
          legislation_id: string
          notes?: string | null
          requirement_text: string
          updated_at?: string
        }
        Update: {
          article?: string | null
          created_at?: string
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
          id: string
          number: string
          origin: string | null
          publication_date: string | null
          revocation_date: string | null
          source: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          id?: string
          number: string
          origin?: string | null
          publication_date?: string | null
          revocation_date?: string | null
          source?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          effective_date?: string | null
          entity?: string | null
          external_id?: string | null
          id?: string
          number?: string
          origin?: string | null
          publication_date?: string | null
          revocation_date?: string | null
          source?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
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
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_approved: boolean
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_approved?: boolean
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
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
      get_legislation_without_categories_count: { Args: never; Returns: number }
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
      audit_status: "planned" | "in_progress" | "completed" | "cancelled"
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
      audit_status: ["planned", "in_progress", "completed", "cancelled"],
    },
  },
} as const
