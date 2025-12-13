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
      ab_test_experiments: {
        Row: {
          created_at: string
          element_type: string
          end_date: string | null
          funnel_id: string | null
          id: string
          name: string
          original_value: string | null
          start_date: string | null
          status: string | null
          updated_at: string
          winner_variant_id: string | null
        }
        Insert: {
          created_at?: string
          element_type: string
          end_date?: string | null
          funnel_id?: string | null
          id?: string
          name: string
          original_value?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          winner_variant_id?: string | null
        }
        Update: {
          created_at?: string
          element_type?: string
          end_date?: string | null
          funnel_id?: string | null
          id?: string
          name?: string
          original_value?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          winner_variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_experiments_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_variants: {
        Row: {
          conversion_rate: number | null
          conversions: number | null
          created_at: string
          experiment_id: string
          id: string
          name: string
          traffic_percentage: number | null
          value: string
          views: number | null
        }
        Insert: {
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          experiment_id: string
          id?: string
          name: string
          traffic_percentage?: number | null
          value: string
          views?: number | null
        }
        Update: {
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          experiment_id?: string
          id?: string
          name?: string
          traffic_percentage?: number | null
          value?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_test_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ad_campaigns: {
        Row: {
          budget_daily: number | null
          created_at: string | null
          external_campaign_id: string | null
          id: string
          name: string | null
          objective: string | null
          performance: Json | null
          platform: string
          status: string | null
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          budget_daily?: number | null
          created_at?: string | null
          external_campaign_id?: string | null
          id?: string
          name?: string | null
          objective?: string | null
          performance?: Json | null
          platform: string
          status?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          budget_daily?: number | null
          created_at?: string | null
          external_campaign_id?: string | null
          id?: string
          name?: string | null
          objective?: string | null
          performance?: Json | null
          platform?: string
          status?: string | null
          targeting?: Json | null
          updated_at?: string | null
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
      api_settings: {
        Row: {
          created_at: string | null
          id: string
          is_configured: boolean | null
          last_tested_at: string | null
          setting_key: string
          setting_value: string | null
          test_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          last_tested_at?: string | null
          setting_key: string
          setting_value?: string | null
          test_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_configured?: boolean | null
          last_tested_at?: string | null
          setting_key?: string
          setting_value?: string | null
          test_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          function_name: string
          id: string
          items_created: number | null
          items_processed: number | null
          metadata: Json | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          items_created?: number | null
          items_processed?: number | null
          metadata?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          items_created?: number | null
          items_processed?: number | null
          metadata?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          channel_type: string
          created_at: string | null
          credentials: Json | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          channel_type: string
          created_at?: string | null
          credentials?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          channel_type?: string
          created_at?: string | null
          credentials?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      chatbot_prompt_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string | null
          id: string
          new_value: string
          old_value: string | null
          prompt_id: string | null
          prompt_key: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_value: string
          old_value?: string | null
          prompt_id?: string | null
          prompt_key: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_value?: string
          old_value?: string | null
          prompt_id?: string | null
          prompt_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_prompt_history_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "chatbot_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_prompts: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          prompt_key: string
          prompt_value: string
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          prompt_key: string
          prompt_value: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          prompt_key?: string
          prompt_value?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      client_tickets: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          id: string
          priority: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_usage: {
        Row: {
          api_calls: number | null
          appointments_booked: number | null
          client_id: string
          conversations_handled: number | null
          created_at: string
          date: string
          id: string
          leads_captured: number | null
          login_count: number | null
        }
        Insert: {
          api_calls?: number | null
          appointments_booked?: number | null
          client_id: string
          conversations_handled?: number | null
          created_at?: string
          date?: string
          id?: string
          leads_captured?: number | null
          login_count?: number | null
        }
        Update: {
          api_calls?: number | null
          appointments_booked?: number | null
          client_id?: string
          conversations_handled?: number | null
          created_at?: string
          date?: string
          id?: string
          leads_captured?: number | null
          login_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_name: string | null
          churned_at: string | null
          created_at: string
          email: string
          health_score: number | null
          id: string
          last_contact: string | null
          lead_id: string | null
          metadata: Json | null
          mrr: number
          name: string
          notes: string | null
          phone: string | null
          plan: string
          start_date: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_name?: string | null
          churned_at?: string | null
          created_at?: string
          email: string
          health_score?: number | null
          id?: string
          last_contact?: string | null
          lead_id?: string | null
          metadata?: Json | null
          mrr?: number
          name: string
          notes?: string | null
          phone?: string | null
          plan?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_name?: string | null
          churned_at?: string | null
          created_at?: string
          email?: string
          health_score?: number | null
          id?: string
          last_contact?: string | null
          lead_id?: string | null
          metadata?: Json | null
          mrr?: number
          name?: string
          notes?: string | null
          phone?: string | null
          plan?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts_unified: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          instagram_id: string | null
          lead_id: string | null
          messenger_id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string | null
          whatsapp_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          instagram_id?: string | null
          lead_id?: string | null
          messenger_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          instagram_id?: string | null
          lead_id?: string | null
          messenger_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_unified_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          body: string | null
          content_type: string | null
          created_at: string | null
          engagement: Json | null
          id: string
          idea_id: string | null
          media_url: string | null
          platform: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string | null
          title: string | null
          user_feedback: string | null
        }
        Insert: {
          body?: string | null
          content_type?: string | null
          created_at?: string | null
          engagement?: Json | null
          id?: string
          idea_id?: string | null
          media_url?: string | null
          platform?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          title?: string | null
          user_feedback?: string | null
        }
        Update: {
          body?: string | null
          content_type?: string | null
          created_at?: string | null
          engagement?: Json | null
          id?: string
          idea_id?: string | null
          media_url?: string | null
          platform?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          title?: string | null
          user_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "content_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      content_calendar: {
        Row: {
          content_id: string | null
          created_at: string | null
          id: string
          platform: string | null
          scheduled_date: string | null
          status: string | null
          time_slot: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
          scheduled_date?: string | null
          status?: string | null
          time_slot?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string | null
          scheduled_date?: string | null
          status?: string | null
          time_slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_comments: {
        Row: {
          ai_reply: string | null
          comment_text: string | null
          commenter_name: string | null
          content_id: string | null
          created_at: string | null
          external_comment_id: string | null
          id: string
          platform: string | null
          reply_status: string | null
        }
        Insert: {
          ai_reply?: string | null
          comment_text?: string | null
          commenter_name?: string | null
          content_id?: string | null
          created_at?: string | null
          external_comment_id?: string | null
          id?: string
          platform?: string | null
          reply_status?: string | null
        }
        Update: {
          ai_reply?: string | null
          comment_text?: string | null
          commenter_name?: string | null
          content_id?: string | null
          created_at?: string | null
          external_comment_id?: string | null
          id?: string
          platform?: string | null
          reply_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          created_at: string | null
          id: string
          niche: string | null
          source: string | null
          source_transcript: string | null
          source_url: string | null
          status: string | null
          suggested_formats: string[] | null
          topic: string | null
          viral_score: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          niche?: string | null
          source?: string | null
          source_transcript?: string | null
          source_url?: string | null
          status?: string | null
          suggested_formats?: string[] | null
          topic?: string | null
          viral_score?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          niche?: string | null
          source?: string | null
          source_transcript?: string | null
          source_url?: string | null
          status?: string | null
          suggested_formats?: string[] | null
          topic?: string | null
          viral_score?: number | null
        }
        Relationships: []
      }
      content_patterns: {
        Row: {
          confidence_score: number | null
          content_type: string
          created_at: string | null
          engagement_score: number | null
          example_prompt: string | null
          id: string
          metadata: Json | null
          pattern_category: string
          pattern_description: string
          pattern_type: string
          times_successful: number | null
          times_used: number | null
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          content_type: string
          created_at?: string | null
          engagement_score?: number | null
          example_prompt?: string | null
          id?: string
          metadata?: Json | null
          pattern_category: string
          pattern_description: string
          pattern_type?: string
          times_successful?: number | null
          times_used?: number | null
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          content_type?: string
          created_at?: string | null
          engagement_score?: number | null
          example_prompt?: string | null
          id?: string
          metadata?: Json | null
          pattern_category?: string
          pattern_description?: string
          pattern_type?: string
          times_successful?: number | null
          times_used?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      content_performance: {
        Row: {
          ai_analysis: Json | null
          classification: string | null
          clicks: number | null
          comments: number | null
          completion_rate: number | null
          content_id: string | null
          content_type: string
          conversions: number | null
          created_at: string | null
          enhanced_prompt: string | null
          extracted_patterns: Json | null
          id: string
          original_prompt: string | null
          platform: string | null
          shares: number | null
          user_rating: number | null
          views: number | null
          watch_time_avg: number | null
        }
        Insert: {
          ai_analysis?: Json | null
          classification?: string | null
          clicks?: number | null
          comments?: number | null
          completion_rate?: number | null
          content_id?: string | null
          content_type: string
          conversions?: number | null
          created_at?: string | null
          enhanced_prompt?: string | null
          extracted_patterns?: Json | null
          id?: string
          original_prompt?: string | null
          platform?: string | null
          shares?: number | null
          user_rating?: number | null
          views?: number | null
          watch_time_avg?: number | null
        }
        Update: {
          ai_analysis?: Json | null
          classification?: string | null
          clicks?: number | null
          comments?: number | null
          completion_rate?: number | null
          content_id?: string | null
          content_type?: string
          conversions?: number | null
          created_at?: string | null
          enhanced_prompt?: string | null
          extracted_patterns?: Json | null
          id?: string
          original_prompt?: string | null
          platform?: string | null
          shares?: number | null
          user_rating?: number | null
          views?: number | null
          watch_time_avg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
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
      conversations_unified: {
        Row: {
          assigned_to: string | null
          channel_type: string
          contact_id: string | null
          created_at: string | null
          external_id: string | null
          id: string
          last_message_at: string | null
          status: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel_type: string
          contact_id?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_message_at?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel_type?: string
          contact_id?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_message_at?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_unified_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_enrollments: {
        Row: {
          ai_assigned: boolean | null
          assignment_reason: string | null
          completed_at: string | null
          converted: boolean | null
          current_stage_id: string | null
          enrolled_at: string
          funnel_id: string
          id: string
          lead_id: string | null
          visitor_id: string
        }
        Insert: {
          ai_assigned?: boolean | null
          assignment_reason?: string | null
          completed_at?: string | null
          converted?: boolean | null
          current_stage_id?: string | null
          enrolled_at?: string
          funnel_id: string
          id?: string
          lead_id?: string | null
          visitor_id: string
        }
        Update: {
          ai_assigned?: boolean | null
          assignment_reason?: string | null
          completed_at?: string | null
          converted?: boolean | null
          current_stage_id?: string | null
          enrolled_at?: string
          funnel_id?: string
          id?: string
          lead_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_enrollments_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_enrollments_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stage_conversions: {
        Row: {
          converted: boolean | null
          entered_at: string
          exited_at: string | null
          funnel_id: string
          id: string
          stage_id: string
          time_spent_seconds: number | null
          variant_id: string | null
          visitor_id: string
        }
        Insert: {
          converted?: boolean | null
          entered_at?: string
          exited_at?: string | null
          funnel_id: string
          id?: string
          stage_id: string
          time_spent_seconds?: number | null
          variant_id?: string | null
          visitor_id: string
        }
        Update: {
          converted?: boolean | null
          entered_at?: string
          exited_at?: string | null
          funnel_id?: string
          id?: string
          stage_id?: string
          time_spent_seconds?: number | null
          variant_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stage_conversions_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_conversions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_conversions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          created_at: string
          funnel_id: string
          id: string
          name: string
          stage_order: number
          stage_type: string | null
          target_action: string | null
        }
        Insert: {
          created_at?: string
          funnel_id: string
          id?: string
          name: string
          stage_order: number
          stage_type?: string | null
          target_action?: string | null
        }
        Update: {
          created_at?: string
          funnel_id?: string
          id?: string
          name?: string
          stage_order?: number
          stage_type?: string | null
          target_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          created_at: string
          description: string | null
          goal: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          target_score_max: number | null
          target_score_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          target_score_max?: number | null
          target_score_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          target_score_max?: number | null
          target_score_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      keywords: {
        Row: {
          competition: string | null
          cpc_estimate: number | null
          created_at: string | null
          current_rank: number | null
          id: string
          keyword: string
          search_volume: number | null
          status: string | null
          trend_data: Json | null
        }
        Insert: {
          competition?: string | null
          cpc_estimate?: number | null
          created_at?: string | null
          current_rank?: number | null
          id?: string
          keyword: string
          search_volume?: number | null
          status?: string | null
          trend_data?: Json | null
        }
        Update: {
          competition?: string | null
          cpc_estimate?: number | null
          created_at?: string | null
          current_rank?: number | null
          id?: string
          keyword?: string
          search_volume?: number | null
          status?: string | null
          trend_data?: Json | null
        }
        Relationships: []
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
      messages_unified: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          delivered_at: string | null
          direction: string
          id: string
          is_mock: boolean | null
          media_url: string | null
          metadata: Json | null
          read_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          direction: string
          id?: string
          is_mock?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          direction?: string
          id?: string
          is_mock?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_unified_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations_unified"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_inspiration: {
        Row: {
          content_type: string
          description: string | null
          engagement_metrics: Json | null
          extracted_patterns: Json | null
          id: string
          is_processed: boolean | null
          niche: string | null
          scraped_at: string | null
          source_platform: string | null
          source_url: string | null
          title: string | null
          viral_score: number | null
        }
        Insert: {
          content_type: string
          description?: string | null
          engagement_metrics?: Json | null
          extracted_patterns?: Json | null
          id?: string
          is_processed?: boolean | null
          niche?: string | null
          scraped_at?: string | null
          source_platform?: string | null
          source_url?: string | null
          title?: string | null
          viral_score?: number | null
        }
        Update: {
          content_type?: string
          description?: string | null
          engagement_metrics?: Json | null
          extracted_patterns?: Json | null
          id?: string
          is_processed?: boolean | null
          niche?: string | null
          scraped_at?: string | null
          source_platform?: string | null
          source_url?: string | null
          title?: string | null
          viral_score?: number | null
        }
        Relationships: []
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string | null
          current_step: number | null
          id: string
          next_step_at: string | null
          sequence_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_step_at?: string | null
          sequence_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_step_at?: string | null
          sequence_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string | null
          description: string | null
          enrolled_count: number | null
          id: string
          is_active: boolean | null
          name: string
          steps: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enrolled_count?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          steps?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enrolled_count?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      work_queue: {
        Row: {
          agent_type: string
          completed_at: string | null
          created_at: string
          deny_reason: string | null
          description: string | null
          id: string
          metadata: Json | null
          priority: string
          source: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          created_at?: string
          deny_reason?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          source?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          created_at?: string
          deny_reason?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          source?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
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
