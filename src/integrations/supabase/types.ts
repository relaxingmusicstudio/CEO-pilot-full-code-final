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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ab_tests: {
        Row: {
          conversion_value: number | null
          converted: boolean | null
          created_at: string | null
          id: string
          test_name: string
          variant: string
          visitor_id: string | null
        }
        Insert: {
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string | null
          id?: string
          test_name: string
          variant: string
          visitor_id?: string | null
        }
        Update: {
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string | null
          id?: string
          test_name?: string
          variant?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          page_url: string | null
          session_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          page_url?: string | null
          session_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          page_url?: string | null
          session_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_analysis: Json | null
          conversation_phase: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          lead_data: Json | null
          message_count: number | null
          messages: Json
          outcome: string | null
          session_id: string
          updated_at: string | null
          visitor_id: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          conversation_phase?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          lead_data?: Json | null
          message_count?: number | null
          messages?: Json
          outcome?: string | null
          session_id: string
          updated_at?: string | null
          visitor_id?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          conversation_phase?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          lead_data?: Json | null
          message_count?: number | null
          messages?: Json
          outcome?: string | null
          session_id?: string
          updated_at?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["visitor_id"]
          },
        ]
      }
      leads: {
        Row: {
          business_name: string | null
          buying_signals: string[] | null
          call_volume: string | null
          conversation_id: string | null
          conversion_probability: number | null
          converted_at: string | null
          created_at: string | null
          email: string | null
          ghl_contact_id: string | null
          id: string
          interests: string[] | null
          lead_score: number | null
          lead_temperature: string | null
          name: string | null
          notes: string | null
          objections: string[] | null
          phone: string | null
          revenue_value: number | null
          status: string | null
          team_size: string | null
          timeline: string | null
          trade: string | null
          updated_at: string | null
          visitor_id: string | null
        }
        Insert: {
          business_name?: string | null
          buying_signals?: string[] | null
          call_volume?: string | null
          conversation_id?: string | null
          conversion_probability?: number | null
          converted_at?: string | null
          created_at?: string | null
          email?: string | null
          ghl_contact_id?: string | null
          id?: string
          interests?: string[] | null
          lead_score?: number | null
          lead_temperature?: string | null
          name?: string | null
          notes?: string | null
          objections?: string[] | null
          phone?: string | null
          revenue_value?: number | null
          status?: string | null
          team_size?: string | null
          timeline?: string | null
          trade?: string | null
          updated_at?: string | null
          visitor_id?: string | null
        }
        Update: {
          business_name?: string | null
          buying_signals?: string[] | null
          call_volume?: string | null
          conversation_id?: string | null
          conversion_probability?: number | null
          converted_at?: string | null
          created_at?: string | null
          email?: string | null
          ghl_contact_id?: string | null
          id?: string
          interests?: string[] | null
          lead_score?: number | null
          lead_temperature?: string | null
          name?: string | null
          notes?: string | null
          objections?: string[] | null
          phone?: string | null
          revenue_value?: number | null
          status?: string | null
          team_size?: string | null
          timeline?: string | null
          trade?: string | null
          updated_at?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["visitor_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          browser: string | null
          created_at: string | null
          device: string | null
          first_seen_at: string | null
          id: string
          landing_page: string | null
          last_seen_at: string | null
          referrer: string | null
          total_visits: number | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device?: string | null
          first_seen_at?: string | null
          id?: string
          landing_page?: string | null
          last_seen_at?: string | null
          referrer?: string | null
          total_visits?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device?: string | null
          first_seen_at?: string | null
          id?: string
          landing_page?: string | null
          last_seen_at?: string | null
          referrer?: string | null
          total_visits?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
