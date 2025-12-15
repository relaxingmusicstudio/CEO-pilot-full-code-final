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
      accounting_sync_log: {
        Row: {
          created_at: string | null
          entity_type: string
          error_message: string | null
          external_id: string | null
          id: string
          internal_id: string
          provider: string | null
          sync_direction: string | null
          sync_status: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          internal_id: string
          provider?: string | null
          sync_direction?: string | null
          sync_status?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          internal_id?: string
          provider?: string | null
          sync_direction?: string | null
          sync_status?: string | null
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_score: number | null
          annual_revenue: number | null
          created_at: string
          employee_count: number | null
          engagement_score: number | null
          health_score: number | null
          id: string
          industry: string | null
          last_activity_at: string | null
          name: string
          tier: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_score?: number | null
          annual_revenue?: number | null
          created_at?: string
          employee_count?: number | null
          engagement_score?: number | null
          health_score?: number | null
          id?: string
          industry?: string | null
          last_activity_at?: string | null
          name: string
          tier?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_score?: number | null
          annual_revenue?: number | null
          created_at?: string
          employee_count?: number | null
          engagement_score?: number | null
          health_score?: number | null
          id?: string
          industry?: string | null
          last_activity_at?: string | null
          name?: string
          tier?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      action_priority_rules: {
        Row: {
          action_type: string | null
          agent_type: string | null
          base_priority: number | null
          created_at: string
          id: string
          is_active: boolean | null
          priority_modifiers: Json | null
          rule_name: string
        }
        Insert: {
          action_type?: string | null
          agent_type?: string | null
          base_priority?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          priority_modifiers?: Json | null
          rule_name: string
        }
        Update: {
          action_type?: string | null
          agent_type?: string | null
          base_priority?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          priority_modifiers?: Json | null
          rule_name?: string
        }
        Relationships: []
      }
      action_queue: {
        Row: {
          action_payload: Json | null
          action_type: string
          agent_type: string
          conflict_resolution: string | null
          created_at: string
          executed_at: string | null
          id: string
          priority: number | null
          result: Json | null
          scheduled_at: string | null
          status: string | null
          target_id: string
          target_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          action_payload?: Json | null
          action_type: string
          agent_type: string
          conflict_resolution?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          priority?: number | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string | null
          target_id: string
          target_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          action_payload?: Json | null
          action_type?: string
          agent_type?: string
          conflict_resolution?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          priority?: number | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string | null
          target_id?: string
          target_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      agent_cost_tracking: {
        Row: {
          agent_type: string
          api_calls: number | null
          avg_latency_ms: number | null
          cost_cents: number | null
          created_at: string
          date: string
          id: string
          success_rate: number | null
          tokens_used: number | null
          updated_at: string
        }
        Insert: {
          agent_type: string
          api_calls?: number | null
          avg_latency_ms?: number | null
          cost_cents?: number | null
          created_at?: string
          date?: string
          id?: string
          success_rate?: number | null
          tokens_used?: number | null
          updated_at?: string
        }
        Update: {
          agent_type?: string
          api_calls?: number | null
          avg_latency_ms?: number | null
          cost_cents?: number | null
          created_at?: string
          date?: string
          id?: string
          success_rate?: number | null
          tokens_used?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_integration_permissions: {
        Row: {
          agent_name: string
          allowed_actions: Json | null
          allowed_services: string[] | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          max_cost_per_day_cents: number | null
          max_daily_api_calls: number | null
          required_services: string[] | null
          updated_at: string | null
        }
        Insert: {
          agent_name: string
          allowed_actions?: Json | null
          allowed_services?: string[] | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          max_cost_per_day_cents?: number | null
          max_daily_api_calls?: number | null
          required_services?: string[] | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string
          allowed_actions?: Json | null
          allowed_services?: string[] | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          max_cost_per_day_cents?: number | null
          max_daily_api_calls?: number | null
          required_services?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_memories: {
        Row: {
          agent_type: string
          created_at: string | null
          id: string
          last_used_at: string | null
          metadata: Json | null
          methodology_effectiveness: Json | null
          query: string
          query_embedding: string | null
          response: string
          sales_methodology: string | null
          success_score: number | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          agent_type: string
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          methodology_effectiveness?: Json | null
          query: string
          query_embedding?: string | null
          response: string
          sales_methodology?: string | null
          success_score?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          methodology_effectiveness?: Json | null
          query?: string
          query_embedding?: string | null
          response?: string
          sales_methodology?: string | null
          success_score?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      agent_performance: {
        Row: {
          accuracy_score: number | null
          agent_type: string
          avg_response_time_ms: number | null
          cache_hits: number | null
          created_at: string | null
          date: string
          id: string
          memories_created: number | null
          negative_feedback: number | null
          positive_feedback: number | null
          total_queries: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy_score?: number | null
          agent_type: string
          avg_response_time_ms?: number | null
          cache_hits?: number | null
          created_at?: string | null
          date?: string
          id?: string
          memories_created?: number | null
          negative_feedback?: number | null
          positive_feedback?: number | null
          total_queries?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy_score?: number | null
          agent_type?: string
          avg_response_time_ms?: number | null
          cache_hits?: number | null
          created_at?: string | null
          date?: string
          id?: string
          memories_created?: number | null
          negative_feedback?: number | null
          positive_feedback?: number | null
          total_queries?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_roi_metrics: {
        Row: {
          agent_type: string
          attributed_revenue: number | null
          conversions: number | null
          cost_spent: number | null
          created_at: string
          date: string
          id: string
          leads_generated: number | null
          roi_percentage: number | null
        }
        Insert: {
          agent_type: string
          attributed_revenue?: number | null
          conversions?: number | null
          cost_spent?: number | null
          created_at?: string
          date?: string
          id?: string
          leads_generated?: number | null
          roi_percentage?: number | null
        }
        Update: {
          agent_type?: string
          attributed_revenue?: number | null
          conversions?: number | null
          cost_spent?: number | null
          created_at?: string
          date?: string
          id?: string
          leads_generated?: number | null
          roi_percentage?: number | null
        }
        Relationships: []
      }
      agent_shared_state: {
        Row: {
          category: string | null
          created_at: string
          expires_at: string | null
          id: string
          key: string
          last_accessed_by: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          category?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          last_accessed_by?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          last_accessed_by?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      agent_skill_registry: {
        Row: {
          agent_name: string
          avg_quality_score: number | null
          created_at: string
          current_workload: number | null
          id: string
          is_active: boolean | null
          last_task_completed_at: string | null
          max_workload: number | null
          reliability_score: number | null
          skill_tags: Json | null
          tenant_id: string | null
          total_tasks_completed: number | null
          updated_at: string
        }
        Insert: {
          agent_name: string
          avg_quality_score?: number | null
          created_at?: string
          current_workload?: number | null
          id?: string
          is_active?: boolean | null
          last_task_completed_at?: string | null
          max_workload?: number | null
          reliability_score?: number | null
          skill_tags?: Json | null
          tenant_id?: string | null
          total_tasks_completed?: number | null
          updated_at?: string
        }
        Update: {
          agent_name?: string
          avg_quality_score?: number | null
          created_at?: string
          current_workload?: number | null
          id?: string
          is_active?: boolean | null
          last_task_completed_at?: string | null
          max_workload?: number | null
          reliability_score?: number | null
          skill_tags?: Json | null
          tenant_id?: string | null
          total_tasks_completed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_cost_log: {
        Row: {
          agent_name: string
          cached: boolean | null
          cost_usd: number | null
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          priority: string | null
          success: boolean | null
        }
        Insert: {
          agent_name: string
          cached?: boolean | null
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          priority?: string | null
          success?: boolean | null
        }
        Update: {
          agent_name?: string
          cached?: boolean | null
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          priority?: string | null
          success?: boolean | null
        }
        Relationships: []
      }
      ai_rate_limit_usage: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          request_count: number | null
          window_start: string
          window_type: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          id?: string
          request_count?: number | null
          window_start: string
          window_type: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          request_count?: number | null
          window_start?: string
          window_type?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          is_active: boolean | null
          off_hours_end: string | null
          off_hours_multiplier: number | null
          off_hours_start: string | null
          priority_level: string
          requests_per_day: number | null
          requests_per_hour: number | null
          requests_per_minute: number | null
          updated_at: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          off_hours_end?: string | null
          off_hours_multiplier?: number | null
          off_hours_start?: string | null
          priority_level?: string
          requests_per_day?: number | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          updated_at?: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          off_hours_end?: string | null
          off_hours_multiplier?: number | null
          off_hours_start?: string | null
          priority_level?: string
          requests_per_day?: number | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_response_cache: {
        Row: {
          cache_key: string
          cost_estimate: number | null
          created_at: string
          expires_at: string
          hit_count: number | null
          id: string
          input_tokens: number | null
          last_accessed_at: string | null
          messages_hash: string
          model: string
          output_tokens: number | null
          prompt_hash: string
          response_json: Json
        }
        Insert: {
          cache_key: string
          cost_estimate?: number | null
          created_at?: string
          expires_at: string
          hit_count?: number | null
          id?: string
          input_tokens?: number | null
          last_accessed_at?: string | null
          messages_hash: string
          model: string
          output_tokens?: number | null
          prompt_hash: string
          response_json: Json
        }
        Update: {
          cache_key?: string
          cost_estimate?: number | null
          created_at?: string
          expires_at?: string
          hit_count?: number | null
          id?: string
          input_tokens?: number | null
          last_accessed_at?: string | null
          messages_hash?: string
          model?: string
          output_tokens?: number | null
          prompt_hash?: string
          response_json?: Json
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_logs: {
        Row: {
          cost_cents: number | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          method: string
          request_body: Json | null
          response_status: number | null
          response_time_ms: number | null
          service: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          method?: string
          request_body?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          service: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          method?: string
          request_body?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          service?: string
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
      bank_connections: {
        Row: {
          access_token: string | null
          company_id: string | null
          created_at: string | null
          id: string
          institution_name: string | null
          is_active: boolean | null
          item_id: string | null
          last_sync_at: string | null
          metadata: Json | null
          provider: string
          refresh_token: string | null
          sync_cursor: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          institution_name?: string | null
          is_active?: boolean | null
          item_id?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          sync_cursor?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          institution_name?: string | null
          is_active?: boolean | null
          item_id?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          sync_cursor?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          ai_category: string | null
          ai_confidence: number | null
          amount: number
          category: string[] | null
          connection_id: string | null
          created_at: string | null
          date: string
          id: string
          merchant_name: string | null
          metadata: Json | null
          name: string
          needs_review: boolean | null
          plaid_transaction_id: string | null
          quickbooks_id: string | null
          reviewed_at: string | null
          transaction_type: string | null
        }
        Insert: {
          ai_category?: string | null
          ai_confidence?: number | null
          amount: number
          category?: string[] | null
          connection_id?: string | null
          created_at?: string | null
          date: string
          id?: string
          merchant_name?: string | null
          metadata?: Json | null
          name: string
          needs_review?: boolean | null
          plaid_transaction_id?: string | null
          quickbooks_id?: string | null
          reviewed_at?: string | null
          transaction_type?: string | null
        }
        Update: {
          ai_category?: string | null
          ai_confidence?: number | null
          amount?: number
          category?: string[] | null
          connection_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          merchant_name?: string | null
          metadata?: Json | null
          name?: string
          needs_review?: boolean | null
          plaid_transaction_id?: string | null
          quickbooks_id?: string | null
          reviewed_at?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_agent_actions: {
        Row: {
          action_type: string
          ai_confidence: number | null
          amount: number | null
          approved_by: string | null
          client_id: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          human_approved: boolean | null
          id: string
          reason: string
          requires_human_review: boolean | null
          result: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action_type: string
          ai_confidence?: number | null
          amount?: number | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          human_approved?: boolean | null
          id?: string
          reason: string
          requires_human_review?: boolean | null
          result?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action_type?: string
          ai_confidence?: number | null
          amount?: number | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          human_approved?: boolean | null
          id?: string
          reason?: string
          requires_human_review?: boolean | null
          result?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_agent_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      business_context: {
        Row: {
          auto_mode: string | null
          context_type: string
          created_at: string
          end_time: string
          external_id: string | null
          id: string
          metadata: Json | null
          start_time: string
          title: string | null
          updated_at: string
        }
        Insert: {
          auto_mode?: string | null
          context_type: string
          created_at?: string
          end_time: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          start_time: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          auto_mode?: string | null
          context_type?: string
          created_at?: string
          end_time?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          start_time?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          is_ai_accessible: boolean | null
          keywords: string[] | null
          priority: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          id?: string
          is_ai_accessible?: boolean | null
          keywords?: string[] | null
          priority?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          is_ai_accessible?: boolean | null
          keywords?: string[] | null
          priority?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      business_profile: {
        Row: {
          address: string | null
          ai_preferences: Json | null
          avg_job_value: number | null
          brand_voice: Json | null
          business_hours: Json | null
          business_name: string | null
          created_at: string | null
          email: string | null
          id: string
          industry: string | null
          main_competitors: string[] | null
          monthly_call_volume: number | null
          notification_settings: Json | null
          onboarding_completed_at: string | null
          onboarding_progress: Json | null
          pain_points: string[] | null
          phone: string | null
          service_area: string | null
          services: string[] | null
          target_customer_description: string | null
          tenant_id: string | null
          timezone: string | null
          unique_selling_points: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          ai_preferences?: Json | null
          avg_job_value?: number | null
          brand_voice?: Json | null
          business_hours?: Json | null
          business_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          main_competitors?: string[] | null
          monthly_call_volume?: number | null
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_progress?: Json | null
          pain_points?: string[] | null
          phone?: string | null
          service_area?: string | null
          services?: string[] | null
          target_customer_description?: string | null
          tenant_id?: string | null
          timezone?: string | null
          unique_selling_points?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          ai_preferences?: Json | null
          avg_job_value?: number | null
          brand_voice?: Json | null
          business_hours?: Json | null
          business_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          main_competitors?: string[] | null
          monthly_call_volume?: number | null
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_progress?: Json | null
          pain_points?: string[] | null
          phone?: string | null
          service_area?: string | null
          services?: string[] | null
          target_customer_description?: string | null
          tenant_id?: string | null
          timezone?: string | null
          unique_selling_points?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      buying_committee: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string
          engagement_status: string | null
          id: string
          influence_level: number | null
          last_contacted_at: string | null
          lead_id: string | null
          name: string
          notes: string | null
          role_type: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          engagement_status?: string | null
          id?: string
          influence_level?: number | null
          last_contacted_at?: string | null
          lead_id?: string | null
          name: string
          notes?: string | null
          role_type?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          engagement_status?: string | null
          id?: string
          influence_level?: number | null
          last_contacted_at?: string | null
          lead_id?: string | null
          name?: string
          notes?: string | null
          role_type?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buying_committee_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buying_committee_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buying_committee_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          ai_handled: boolean | null
          answered_at: string | null
          contact_id: string | null
          cost: number | null
          created_at: string
          direction: string
          disposition: string | null
          disposition_notes: string | null
          duration_seconds: number | null
          ended_at: string | null
          external_call_id: string | null
          follow_up_task_id: string | null
          from_number: string | null
          human_requested: boolean | null
          id: string
          lead_id: string | null
          message_collected: Json | null
          phone_number_id: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          to_number: string | null
          transcription: string | null
          vapi_call_id: string | null
        }
        Insert: {
          ai_handled?: boolean | null
          answered_at?: string | null
          contact_id?: string | null
          cost?: number | null
          created_at?: string
          direction: string
          disposition?: string | null
          disposition_notes?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_call_id?: string | null
          follow_up_task_id?: string | null
          from_number?: string | null
          human_requested?: boolean | null
          id?: string
          lead_id?: string | null
          message_collected?: Json | null
          phone_number_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          transcription?: string | null
          vapi_call_id?: string | null
        }
        Update: {
          ai_handled?: boolean | null
          answered_at?: string | null
          contact_id?: string | null
          cost?: number | null
          created_at?: string
          direction?: string
          disposition?: string | null
          disposition_notes?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_call_id?: string | null
          follow_up_task_id?: string | null
          from_number?: string | null
          human_requested?: boolean | null
          id?: string
          lead_id?: string | null
          message_collected?: Json | null
          phone_number_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
          transcription?: string | null
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_follow_up_task_id_fkey"
            columns: ["follow_up_task_id"]
            isOneToOne: false
            referencedRelation: "follow_up_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_action_queue: {
        Row: {
          action_type: string
          claude_reasoning: string | null
          created_at: string
          executed_at: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          payload: Json | null
          priority: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          status: string | null
          target_id: string | null
          target_type: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          claude_reasoning?: string | null
          created_at?: string
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          priority?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          claude_reasoning?: string | null
          created_at?: string
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          priority?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ceo_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          created_at: string
          id: string
          message: string | null
          metadata: Json | null
          priority: string | null
          sent_via: string[] | null
          source: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          priority?: string | null
          sent_via?: string[] | null
          source?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          priority?: string | null
          sent_via?: string[] | null
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      ceo_score_history: {
        Row: {
          breakdown: Json | null
          calculated_at: string
          client_health_score: number | null
          compliance_health_score: number | null
          id: string
          insights: string[] | null
          revenue_health_score: number | null
          score: number
          system_health_score: number | null
          task_health_score: number | null
        }
        Insert: {
          breakdown?: Json | null
          calculated_at?: string
          client_health_score?: number | null
          compliance_health_score?: number | null
          id?: string
          insights?: string[] | null
          revenue_health_score?: number | null
          score: number
          system_health_score?: number | null
          task_health_score?: number | null
        }
        Update: {
          breakdown?: Json | null
          calculated_at?: string
          client_health_score?: number | null
          compliance_health_score?: number | null
          id?: string
          insights?: string[] | null
          revenue_health_score?: number | null
          score?: number
          system_health_score?: number | null
          task_health_score?: number | null
        }
        Relationships: []
      }
      ceo_standing_orders: {
        Row: {
          action_payload: Json | null
          action_type: string
          conditions: Json
          created_at: string
          description: string | null
          executions_count: number | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          rule_name: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          action_payload?: Json | null
          action_type: string
          conditions?: Json
          created_at?: string
          description?: string | null
          executions_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_name: string
          rule_type: string
          updated_at?: string
        }
        Update: {
          action_payload?: Json | null
          action_type?: string
          conditions?: Json
          created_at?: string
          description?: string | null
          executions_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_name?: string
          rule_type?: string
          updated_at?: string
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
      claude_activity_log: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          details: Json | null
          id: string
          result: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          result?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          result?: string | null
        }
        Relationships: []
      }
      client_deliverables: {
        Row: {
          client_id: string
          configuration: Json | null
          created_at: string
          deliverable_type: string
          description: string | null
          id: string
          name: string
          provisioned_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          configuration?: Json | null
          created_at?: string
          deliverable_type: string
          description?: string | null
          id?: string
          name: string
          provisioned_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          configuration?: Json | null
          created_at?: string
          deliverable_type?: string
          description?: string | null
          id?: string
          name?: string
          provisioned_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_deliverables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_interventions: {
        Row: {
          assigned_to: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          id: string
          intervention_type: string
          notes: string | null
          outcome: string | null
          scheduled_at: string | null
          status: string
          trigger_reason: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          intervention_type: string
          notes?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          status?: string
          trigger_reason?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          intervention_type?: string
          notes?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          status?: string
          trigger_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interventions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string
          items: Json | null
          notes: string | null
          paid_at: string | null
          status: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          items?: Json | null
          notes?: string | null
          paid_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          items?: Json | null
          notes?: string | null
          paid_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding: {
        Row: {
          assigned_csm: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          current_step: number | null
          go_live_date: string | null
          id: string
          notes: string | null
          progress_percentage: number | null
          started_at: string | null
          status: string
          total_steps: number | null
          updated_at: string
        }
        Insert: {
          assigned_csm?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          go_live_date?: string | null
          id?: string
          notes?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string
          total_steps?: number | null
          updated_at?: string
        }
        Update: {
          assigned_csm?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          go_live_date?: string | null
          id?: string
          notes?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string
          total_steps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          reference_number: string | null
          status: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          reference_number?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          reference_number?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
        ]
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
      client_training_sessions: {
        Row: {
          attendees: Json | null
          client_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          notes: string | null
          recording_url: string | null
          scheduled_at: string | null
          session_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: Json | null
          client_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          session_type: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: Json | null
          client_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          session_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_training_sessions_client_id_fkey"
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
      client_value_reports: {
        Row: {
          client_id: string
          created_at: string
          generated_at: string | null
          id: string
          metrics: Json | null
          pdf_url: string | null
          period_end: string
          period_start: string
          report_type: string
          sent_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          generated_at?: string | null
          id?: string
          metrics?: Json | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          report_type?: string
          sent_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          generated_at?: string | null
          id?: string
          metrics?: Json | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          report_type?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_value_reports_client_id_fkey"
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
          current_period_end: string | null
          current_period_start: string | null
          email: string
          health_score: number | null
          id: string
          included_minutes: number | null
          last_contact: string | null
          lead_id: string | null
          metadata: Json | null
          mrr: number
          name: string
          notes: string | null
          overage_rate: number | null
          phone: string | null
          plan: string
          start_date: string
          status: string
          stripe_customer_id: string | null
          subscription_id: string | null
          subscription_status: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_name?: string | null
          churned_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          email: string
          health_score?: number | null
          id?: string
          included_minutes?: number | null
          last_contact?: string | null
          lead_id?: string | null
          metadata?: Json | null
          mrr?: number
          name: string
          notes?: string | null
          overage_rate?: number | null
          phone?: string | null
          plan?: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_name?: string | null
          churned_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          email?: string
          health_score?: number | null
          id?: string
          included_minutes?: number | null
          last_contact?: string | null
          lead_id?: string | null
          metadata?: Json | null
          mrr?: number
          name?: string
          notes?: string | null
          overage_rate?: number | null
          phone?: string | null
          plan?: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_outreach_campaigns: {
        Row: {
          campaign_type: string | null
          completed_at: string | null
          contacts_reached: number | null
          created_at: string
          daily_limit: number | null
          description: string | null
          id: string
          meetings_booked: number | null
          name: string
          replies_received: number | null
          send_days: string[] | null
          send_window_end: string | null
          send_window_start: string | null
          settings: Json | null
          started_at: string | null
          status: string | null
          timezone: string | null
          total_contacts: number | null
          updated_at: string
        }
        Insert: {
          campaign_type?: string | null
          completed_at?: string | null
          contacts_reached?: number | null
          created_at?: string
          daily_limit?: number | null
          description?: string | null
          id?: string
          meetings_booked?: number | null
          name: string
          replies_received?: number | null
          send_days?: string[] | null
          send_window_end?: string | null
          send_window_start?: string | null
          settings?: Json | null
          started_at?: string | null
          status?: string | null
          timezone?: string | null
          total_contacts?: number | null
          updated_at?: string
        }
        Update: {
          campaign_type?: string | null
          completed_at?: string | null
          contacts_reached?: number | null
          created_at?: string
          daily_limit?: number | null
          description?: string | null
          id?: string
          meetings_booked?: number | null
          name?: string
          replies_received?: number | null
          send_days?: string[] | null
          send_window_end?: string | null
          send_window_start?: string | null
          settings?: Json | null
          started_at?: string | null
          status?: string | null
          timezone?: string | null
          total_contacts?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cold_outreach_contacts: {
        Row: {
          campaign_id: string | null
          company: string | null
          converted_at: string | null
          created_at: string
          current_step: number | null
          custom_fields: Json | null
          do_not_contact: boolean | null
          email: string | null
          first_name: string | null
          id: string
          last_contacted_at: string | null
          last_name: string | null
          linkedin_url: string | null
          phone: string | null
          replied_at: string | null
          status: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          current_step?: number | null
          custom_fields?: Json | null
          do_not_contact?: boolean | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          replied_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          current_step?: number | null
          custom_fields?: Json | null
          do_not_contact?: boolean | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          replied_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_outreach_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "cold_outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_outreach_sends: {
        Row: {
          campaign_id: string | null
          channel: string
          clicked_at: string | null
          contact_id: string | null
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          opened_at: string | null
          replied_at: string | null
          sent_at: string | null
          sequence_id: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel: string
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cold_outreach_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "cold_outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_outreach_sends_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cold_outreach_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_outreach_sends_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "cold_outreach_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_outreach_sequences: {
        Row: {
          body: string
          campaign_id: string | null
          channel: string | null
          click_count: number | null
          created_at: string
          delay_days: number | null
          delay_hours: number | null
          id: string
          is_active: boolean | null
          open_count: number | null
          reply_count: number | null
          sent_count: number | null
          step_number: number
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          campaign_id?: string | null
          channel?: string | null
          click_count?: number | null
          created_at?: string
          delay_days?: number | null
          delay_hours?: number | null
          id?: string
          is_active?: boolean | null
          open_count?: number | null
          reply_count?: number | null
          sent_count?: number | null
          step_number: number
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          channel?: string | null
          click_count?: number | null
          created_at?: string
          delay_days?: number | null
          delay_hours?: number | null
          id?: string
          is_active?: boolean | null
          open_count?: number | null
          reply_count?: number | null
          sent_count?: number | null
          step_number?: number
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_outreach_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "cold_outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_watch: {
        Row: {
          competitor_facebook: string | null
          competitor_name: string
          competitor_website: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          monitor_type: string[] | null
          prospects_found: number | null
          updated_at: string | null
        }
        Insert: {
          competitor_facebook?: string | null
          competitor_name: string
          competitor_website?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          monitor_type?: string[] | null
          prospects_found?: number | null
          updated_at?: string | null
        }
        Update: {
          competitor_facebook?: string | null
          competitor_name?: string
          competitor_website?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          monitor_type?: string[] | null
          prospects_found?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compliance_audit_log: {
        Row: {
          action_type: string
          agent_name: string
          compliance_status: string
          consent_basis: string | null
          created_at: string
          data_source: string | null
          id: string
          metadata: Json | null
          resource_url: string | null
          risk_score: number | null
          rule_checked: string | null
        }
        Insert: {
          action_type: string
          agent_name: string
          compliance_status?: string
          consent_basis?: string | null
          created_at?: string
          data_source?: string | null
          id?: string
          metadata?: Json | null
          resource_url?: string | null
          risk_score?: number | null
          rule_checked?: string | null
        }
        Update: {
          action_type?: string
          agent_name?: string
          compliance_status?: string
          consent_basis?: string | null
          created_at?: string
          data_source?: string | null
          id?: string
          metadata?: Json | null
          resource_url?: string | null
          risk_score?: number | null
          rule_checked?: string | null
        }
        Relationships: []
      }
      compliance_health: {
        Row: {
          blocked_actions: number | null
          created_at: string
          date: string
          flagged_actions: number | null
          health_score: number
          id: string
          passed_checks: number | null
          risk_alerts: number | null
          top_risk_areas: Json | null
          total_checks: number | null
        }
        Insert: {
          blocked_actions?: number | null
          created_at?: string
          date?: string
          flagged_actions?: number | null
          health_score?: number
          id?: string
          passed_checks?: number | null
          risk_alerts?: number | null
          top_risk_areas?: Json | null
          total_checks?: number | null
        }
        Update: {
          blocked_actions?: number | null
          created_at?: string
          date?: string
          flagged_actions?: number | null
          health_score?: number
          id?: string
          passed_checks?: number | null
          risk_alerts?: number | null
          top_risk_areas?: Json | null
          total_checks?: number | null
        }
        Relationships: []
      }
      compliance_rules: {
        Row: {
          category: string
          created_at: string
          description: string | null
          enforcement_level: string
          id: string
          is_active: boolean
          rule_key: string
          rule_type: string
          rule_value: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          enforcement_level?: string
          id?: string
          is_active?: boolean
          rule_key: string
          rule_type?: string
          rule_value: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          enforcement_level?: string
          id?: string
          is_active?: boolean
          rule_key?: string
          rule_type?: string
          rule_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      conflict_log: {
        Row: {
          cancelled_action_ids: string[] | null
          conflicting_actions: Json
          created_at: string
          deferred_action_ids: string[] | null
          id: string
          reasoning: string | null
          resolution_method: string | null
          target_id: string
          target_type: string
          winner_action_id: string | null
        }
        Insert: {
          cancelled_action_ids?: string[] | null
          conflicting_actions: Json
          created_at?: string
          deferred_action_ids?: string[] | null
          id?: string
          reasoning?: string | null
          resolution_method?: string | null
          target_id: string
          target_type: string
          winner_action_id?: string | null
        }
        Update: {
          cancelled_action_ids?: string[] | null
          conflicting_actions?: Json
          created_at?: string
          deferred_action_ids?: string[] | null
          id?: string
          reasoning?: string | null
          resolution_method?: string | null
          target_id?: string
          target_type?: string
          winner_action_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conflict_log_winner_action_id_fkey"
            columns: ["winner_action_id"]
            isOneToOne: false
            referencedRelation: "action_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_audit_log: {
        Row: {
          action: string
          channel: string | null
          consent_text: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          lead_id: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          channel?: string | null
          consent_text?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          channel?: string | null
          consent_text?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_audit_log_lead_id_fkey"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "contacts_unified_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      credential_usage_log: {
        Row: {
          action: string
          agent_name: string
          created_at: string | null
          credential_id: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          purpose: string | null
          service_key: string
          success: boolean | null
        }
        Insert: {
          action: string
          agent_name: string
          created_at?: string | null
          credential_id?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          purpose?: string | null
          service_key: string
          success?: boolean | null
        }
        Update: {
          action?: string
          agent_name?: string
          created_at?: string | null
          credential_id?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          purpose?: string | null
          service_key?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "credential_usage_log_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "service_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_pipeline: {
        Row: {
          buying_signals: Json | null
          client_id: string | null
          company: string | null
          competitor_mentions: Json | null
          created_at: string
          days_in_stage: number | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          name: string
          next_action: string | null
          probability: number
          sales_methodology: string | null
          sentiment_score: number | null
          stage: string
          updated_at: string
          value: number
        }
        Insert: {
          buying_signals?: Json | null
          client_id?: string | null
          company?: string | null
          competitor_mentions?: Json | null
          created_at?: string
          days_in_stage?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          name: string
          next_action?: string | null
          probability?: number
          sales_methodology?: string | null
          sentiment_score?: number | null
          stage?: string
          updated_at?: string
          value?: number
        }
        Update: {
          buying_signals?: Json | null
          client_id?: string | null
          company?: string | null
          competitor_mentions?: Json | null
          created_at?: string
          days_in_stage?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          name?: string
          next_action?: string | null
          probability?: number
          sales_methodology?: string | null
          sentiment_score?: number | null
          stage?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_pipeline_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_pipeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      dialer_queue: {
        Row: {
          attempts: number | null
          campaign_id: string | null
          consent_source: string | null
          consent_verified: boolean | null
          contact_id: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          lead_id: string | null
          max_attempts: number | null
          notes: string | null
          phone_number: string
          priority: number | null
          requires_human: boolean | null
          scheduled_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number | null
          campaign_id?: string | null
          consent_source?: string | null
          consent_verified?: boolean | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          lead_id?: string | null
          max_attempts?: number | null
          notes?: string | null
          phone_number: string
          priority?: number | null
          requires_human?: boolean | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number | null
          campaign_id?: string | null
          consent_source?: string | null
          consent_verified?: boolean | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          lead_id?: string | null
          max_attempts?: number | null
          notes?: string | null
          phone_number?: string
          priority?: number | null
          requires_human?: boolean | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialer_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialer_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_queue: {
        Row: {
          attempts: number | null
          created_at: string
          error_message: string | null
          id: string
          lead_id: string | null
          priority: number | null
          processed_at: string | null
          stage: string
          status: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          priority?: number | null
          processed_at?: string | null
          stage?: string
          status?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          priority?: number | null
          processed_at?: string | null
          stage?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_queue: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          client_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          outcome: string | null
          resolution_notes: string | null
          resolved_at: string | null
          response_time_minutes: number | null
          rule_id: string | null
          source_agent: string
          status: string | null
          trigger_data: Json | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          outcome?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          response_time_minutes?: number | null
          rule_id?: string | null
          source_agent: string
          status?: string | null
          trigger_data?: Json | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          outcome?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          response_time_minutes?: number | null
          rule_id?: string | null
          source_agent?: string
          status?: string | null
          trigger_data?: Json | null
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_queue_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "escalation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rules: {
        Row: {
          assigned_to: string | null
          auto_resolve_hours: number | null
          created_at: string
          description: string | null
          escalation_channel: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          rule_name: string
          trigger_conditions: Json
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_resolve_hours?: number | null
          created_at?: string
          description?: string | null
          escalation_channel?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_name: string
          trigger_conditions?: Json
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_resolve_hours?: number | null
          created_at?: string
          description?: string | null
          escalation_channel?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_name?: string
          trigger_conditions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      expansion_revenue: {
        Row: {
          change_amount: number | null
          client_id: string
          created_at: string
          effective_date: string | null
          id: string
          new_mrr: number | null
          old_mrr: number | null
          reason: string | null
          revenue_type: string
        }
        Insert: {
          change_amount?: number | null
          client_id: string
          created_at?: string
          effective_date?: string | null
          id?: string
          new_mrr?: number | null
          old_mrr?: number | null
          reason?: string | null
          revenue_type: string
        }
        Update: {
          change_amount?: number | null
          client_id?: string
          created_at?: string
          effective_date?: string | null
          id?: string
          new_mrr?: number | null
          old_mrr?: number | null
          reason?: string | null
          revenue_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "expansion_revenue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_forecasts: {
        Row: {
          actual_revenue: number | null
          confidence_score: number | null
          created_at: string
          factors: Json | null
          forecast_date: string
          forecast_type: string | null
          id: string
          predicted_costs: number | null
          predicted_mrr: number | null
          predicted_revenue: number | null
          variance_percentage: number | null
        }
        Insert: {
          actual_revenue?: number | null
          confidence_score?: number | null
          created_at?: string
          factors?: Json | null
          forecast_date: string
          forecast_type?: string | null
          id?: string
          predicted_costs?: number | null
          predicted_mrr?: number | null
          predicted_revenue?: number | null
          variance_percentage?: number | null
        }
        Update: {
          actual_revenue?: number | null
          confidence_score?: number | null
          created_at?: string
          factors?: Json | null
          forecast_date?: string
          forecast_type?: string | null
          id?: string
          predicted_costs?: number | null
          predicted_mrr?: number | null
          predicted_revenue?: number | null
          variance_percentage?: number | null
        }
        Relationships: []
      }
      follow_up_tasks: {
        Row: {
          ai_draft_email: Json | null
          ai_draft_script: string | null
          ai_draft_sms: string | null
          assigned_to: string | null
          call_log_id: string | null
          caller_email: string | null
          caller_phone: string | null
          contact_id: string | null
          contact_preference: string
          created_at: string
          crm_activity_id: string | null
          crm_logged_at: string | null
          id: string
          lead_id: string | null
          priority: string
          reply_content: string | null
          reply_method: string | null
          reply_sent_at: string | null
          reviewed_at: string | null
          status: string
          timeline_expectation: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          ai_draft_email?: Json | null
          ai_draft_script?: string | null
          ai_draft_sms?: string | null
          assigned_to?: string | null
          call_log_id?: string | null
          caller_email?: string | null
          caller_phone?: string | null
          contact_id?: string | null
          contact_preference?: string
          created_at?: string
          crm_activity_id?: string | null
          crm_logged_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          reply_content?: string | null
          reply_method?: string | null
          reply_sent_at?: string | null
          reviewed_at?: string | null
          status?: string
          timeline_expectation?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          ai_draft_email?: Json | null
          ai_draft_script?: string | null
          ai_draft_sms?: string | null
          assigned_to?: string | null
          call_log_id?: string | null
          caller_email?: string | null
          caller_phone?: string | null
          contact_id?: string | null
          contact_preference?: string
          created_at?: string
          crm_activity_id?: string | null
          crm_logged_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          reply_content?: string | null
          reply_method?: string | null
          reply_sent_at?: string | null
          reviewed_at?: string | null
          status?: string
          timeline_expectation?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_tasks_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      generated_documents: {
        Row: {
          account_id: string | null
          client_id: string | null
          created_at: string
          data: Json | null
          document_type: string
          id: string
          lead_id: string | null
          pdf_url: string | null
          status: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          document_type: string
          id?: string
          lead_id?: string | null
          pdf_url?: string | null
          status?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          document_type?: string
          id?: string
          lead_id?: string | null
          pdf_url?: string | null
          status?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      human_bypass_requests: {
        Row: {
          assigned_to: string | null
          channel: string
          contact_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          original_message: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          trigger_keyword: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel: string
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          original_message?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          trigger_keyword: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          original_message?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          trigger_keyword?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_bypass_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_bypass_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_permission_violations: {
        Row: {
          agent_name: string
          attempted_action: string | null
          attempted_service: string
          created_at: string | null
          details: Json | null
          id: string
          violation_type: string | null
        }
        Insert: {
          agent_name: string
          attempted_action?: string | null
          attempted_service: string
          created_at?: string | null
          details?: Json | null
          id?: string
          violation_type?: string | null
        }
        Update: {
          agent_name?: string
          attempted_action?: string | null
          attempted_service?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          violation_type?: string | null
        }
        Relationships: []
      }
      integration_templates: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          icon_emoji: string | null
          id: string
          is_active: boolean | null
          recommended_services: string[] | null
          required_services: string[] | null
          setup_order: string[] | null
          template_key: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          recommended_services?: string[] | null
          required_services?: string[] | null
          setup_order?: string[] | null
          template_key: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          recommended_services?: string[] | null
          required_services?: string[] | null
          setup_order?: string[] | null
          template_key?: string
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
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          lead_id: string | null
          metadata: Json | null
          outcome: string | null
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          outcome?: string | null
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          outcome?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_enrichment_profiles: {
        Row: {
          annual_revenue_estimate: number | null
          buying_signals: Json | null
          call_responses: number | null
          chat_interactions: number | null
          company_size: string | null
          consent_verified: boolean | null
          contact_risk: string[] | null
          content_downloads: number | null
          created_at: string
          email_opens: number | null
          employee_count_estimate: number | null
          engagement_score: number | null
          enriched_data: Json | null
          enrichment_source: string | null
          fit_score: number | null
          form_submissions: number | null
          id: string
          industry_match: boolean | null
          intent_tags: string[] | null
          interest_score: number | null
          last_consent_date: string | null
          lead_id: string | null
          page_visits: number | null
          routing_agent: string | null
          segment: string | null
          updated_at: string
        }
        Insert: {
          annual_revenue_estimate?: number | null
          buying_signals?: Json | null
          call_responses?: number | null
          chat_interactions?: number | null
          company_size?: string | null
          consent_verified?: boolean | null
          contact_risk?: string[] | null
          content_downloads?: number | null
          created_at?: string
          email_opens?: number | null
          employee_count_estimate?: number | null
          engagement_score?: number | null
          enriched_data?: Json | null
          enrichment_source?: string | null
          fit_score?: number | null
          form_submissions?: number | null
          id?: string
          industry_match?: boolean | null
          intent_tags?: string[] | null
          interest_score?: number | null
          last_consent_date?: string | null
          lead_id?: string | null
          page_visits?: number | null
          routing_agent?: string | null
          segment?: string | null
          updated_at?: string
        }
        Update: {
          annual_revenue_estimate?: number | null
          buying_signals?: Json | null
          call_responses?: number | null
          chat_interactions?: number | null
          company_size?: string | null
          consent_verified?: boolean | null
          contact_risk?: string[] | null
          content_downloads?: number | null
          created_at?: string
          email_opens?: number | null
          employee_count_estimate?: number | null
          engagement_score?: number | null
          enriched_data?: Json | null
          enrichment_source?: string | null
          fit_score?: number | null
          form_submissions?: number | null
          id?: string
          industry_match?: boolean | null
          intent_tags?: string[] | null
          interest_score?: number | null
          last_consent_date?: string | null
          lead_id?: string | null
          page_visits?: number | null
          routing_agent?: string | null
          segment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_enrichment_profiles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          annual_revenue: string | null
          assigned_to: string | null
          best_time_to_call: string | null
          budget_range: string | null
          business_name: string | null
          buying_signals: string[] | null
          call_volume: string | null
          company_website: string | null
          competitor_mentioned: string | null
          consent_date: string | null
          consent_source: string | null
          consent_to_call: boolean | null
          consent_to_email: boolean | null
          consent_to_sms: boolean | null
          conversation_id: string | null
          conversion_probability: number | null
          converted_at: string | null
          created_at: string | null
          custom_fields: Json | null
          decision_maker: boolean | null
          decision_maker_name: string | null
          decision_timeline: string | null
          dnc_date: string | null
          dnc_reason: string | null
          do_not_call: boolean | null
          email: string | null
          follow_up_notes: string | null
          form_name: string | null
          form_submitted_at: string | null
          ghl_contact_id: string | null
          id: string
          interests: string[] | null
          ip_address: string | null
          landing_page: string | null
          last_call_date: string | null
          last_call_notes: string | null
          last_call_outcome: string | null
          lead_score: number | null
          lead_temperature: string | null
          name: string | null
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          number_of_employees: number | null
          objections: string[] | null
          pain_points: string[] | null
          phone: string | null
          preferred_contact_method: string | null
          revenue_value: number | null
          service_type: string | null
          source: string | null
          source_detail: string | null
          status: string | null
          tcpa_consent_text: string | null
          team_size: string | null
          tenant_id: string | null
          timeline: string | null
          timezone: string | null
          total_call_attempts: number | null
          trade: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
          years_in_business: number | null
        }
        Insert: {
          annual_revenue?: string | null
          assigned_to?: string | null
          best_time_to_call?: string | null
          budget_range?: string | null
          business_name?: string | null
          buying_signals?: string[] | null
          call_volume?: string | null
          company_website?: string | null
          competitor_mentioned?: string | null
          consent_date?: string | null
          consent_source?: string | null
          consent_to_call?: boolean | null
          consent_to_email?: boolean | null
          consent_to_sms?: boolean | null
          conversation_id?: string | null
          conversion_probability?: number | null
          converted_at?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          decision_maker?: boolean | null
          decision_maker_name?: string | null
          decision_timeline?: string | null
          dnc_date?: string | null
          dnc_reason?: string | null
          do_not_call?: boolean | null
          email?: string | null
          follow_up_notes?: string | null
          form_name?: string | null
          form_submitted_at?: string | null
          ghl_contact_id?: string | null
          id?: string
          interests?: string[] | null
          ip_address?: string | null
          landing_page?: string | null
          last_call_date?: string | null
          last_call_notes?: string | null
          last_call_outcome?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          name?: string | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          number_of_employees?: number | null
          objections?: string[] | null
          pain_points?: string[] | null
          phone?: string | null
          preferred_contact_method?: string | null
          revenue_value?: number | null
          service_type?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string | null
          tcpa_consent_text?: string | null
          team_size?: string | null
          tenant_id?: string | null
          timeline?: string | null
          timezone?: string | null
          total_call_attempts?: number | null
          trade?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
          years_in_business?: number | null
        }
        Update: {
          annual_revenue?: string | null
          assigned_to?: string | null
          best_time_to_call?: string | null
          budget_range?: string | null
          business_name?: string | null
          buying_signals?: string[] | null
          call_volume?: string | null
          company_website?: string | null
          competitor_mentioned?: string | null
          consent_date?: string | null
          consent_source?: string | null
          consent_to_call?: boolean | null
          consent_to_email?: boolean | null
          consent_to_sms?: boolean | null
          conversation_id?: string | null
          conversion_probability?: number | null
          converted_at?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          decision_maker?: boolean | null
          decision_maker_name?: string | null
          decision_timeline?: string | null
          dnc_date?: string | null
          dnc_reason?: string | null
          do_not_call?: boolean | null
          email?: string | null
          follow_up_notes?: string | null
          form_name?: string | null
          form_submitted_at?: string | null
          ghl_contact_id?: string | null
          id?: string
          interests?: string[] | null
          ip_address?: string | null
          landing_page?: string | null
          last_call_date?: string | null
          last_call_notes?: string | null
          last_call_outcome?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          name?: string | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          number_of_employees?: number | null
          objections?: string[] | null
          pain_points?: string[] | null
          phone?: string | null
          preferred_contact_method?: string | null
          revenue_value?: number | null
          service_type?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string | null
          tcpa_consent_text?: string | null
          team_size?: string | null
          tenant_id?: string | null
          timeline?: string | null
          timezone?: string | null
          total_call_attempts?: number | null
          trade?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
          years_in_business?: number | null
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
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      learning_events: {
        Row: {
          created_at: string | null
          event_type: string
          feedback_source: string | null
          feedback_value: number | null
          id: string
          memory_id: string | null
          metadata: Json | null
          new_score: number | null
          old_score: number | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          feedback_source?: string | null
          feedback_value?: number | null
          id?: string
          memory_id?: string | null
          metadata?: Json | null
          new_score?: number | null
          old_score?: number | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          feedback_source?: string | null
          feedback_value?: number | null
          id?: string
          memory_id?: string | null
          metadata?: Json | null
          new_score?: number | null
          old_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_events_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "agent_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_configuration: {
        Row: {
          api_endpoint: string | null
          config: Json | null
          created_at: string
          failure_count: number | null
          health_status: string | null
          id: string
          is_active: boolean | null
          is_fallback: boolean | null
          is_primary: boolean | null
          last_health_check: string | null
          model_name: string
          priority: number | null
          provider: string
          secret_key_name: string | null
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          config?: Json | null
          created_at?: string
          failure_count?: number | null
          health_status?: string | null
          id?: string
          is_active?: boolean | null
          is_fallback?: boolean | null
          is_primary?: boolean | null
          last_health_check?: string | null
          model_name: string
          priority?: number | null
          provider: string
          secret_key_name?: string | null
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          config?: Json | null
          created_at?: string
          failure_count?: number | null
          health_status?: string | null
          id?: string
          is_active?: boolean | null
          is_fallback?: boolean | null
          is_primary?: boolean | null
          last_health_check?: string | null
          model_name?: string
          priority?: number | null
          provider?: string
          secret_key_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lockdown_rules: {
        Row: {
          action_type: string | null
          agent_type: string | null
          created_at: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          lockdown_action: string
          rule_name: string
          threshold_value: number
          threshold_window_minutes: number
          trigger_count: number | null
          updated_at: string
        }
        Insert: {
          action_type?: string | null
          agent_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          lockdown_action?: string
          rule_name: string
          threshold_value: number
          threshold_window_minutes?: number
          trigger_count?: number | null
          updated_at?: string
        }
        Update: {
          action_type?: string | null
          agent_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          lockdown_action?: string
          rule_name?: string
          threshold_value?: number
          threshold_window_minutes?: number
          trigger_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_spend: {
        Row: {
          campaign: string | null
          conversions: number | null
          created_at: string
          id: string
          leads_generated: number | null
          revenue_attributed: number | null
          source: string
          spend_amount: number
          spend_date: string
        }
        Insert: {
          campaign?: string | null
          conversions?: number | null
          created_at?: string
          id?: string
          leads_generated?: number | null
          revenue_attributed?: number | null
          source: string
          spend_amount?: number
          spend_date?: string
        }
        Update: {
          campaign?: string | null
          conversions?: number | null
          created_at?: string
          id?: string
          leads_generated?: number | null
          revenue_attributed?: number | null
          source?: string
          spend_amount?: number
          spend_date?: string
        }
        Relationships: []
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
      notification_preferences: {
        Row: {
          channels: string[]
          created_at: string
          id: string
          is_enabled: boolean
          notification_type: string
          priority: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type: string
          priority: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type?: string
          priority?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          body: string
          channels: string[]
          created_at: string
          data: Json | null
          id: string
          priority: string
          sent_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          channels?: string[]
          created_at?: string
          data?: Json | null
          id?: string
          priority: string
          sent_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          channels?: string[]
          created_at?: string
          data?: Json | null
          id?: string
          priority?: string
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          client_id: string
          created_at: string
          feedback: string | null
          id: string
          milestone: string | null
          responded_at: string | null
          score: number | null
          sent_at: string | null
          survey_type: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          milestone?: string | null
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          survey_type?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          milestone?: string | null
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          survey_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_enrollments: {
        Row: {
          campaign_id: string | null
          completed_at: string | null
          contact_id: string | null
          converted_at: string | null
          current_step: number | null
          enrolled_at: string
          id: string
          lead_id: string | null
          next_touchpoint_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          converted_at?: string | null
          current_step?: number | null
          enrolled_at?: string
          id?: string
          lead_id?: string | null
          next_touchpoint_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          converted_at?: string | null
          current_step?: number | null
          enrolled_at?: string
          id?: string
          lead_id?: string | null
          next_touchpoint_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nurture_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "warm_nurture_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      nurture_touchpoints: {
        Row: {
          campaign_id: string | null
          conditions: Json | null
          content: Json | null
          created_at: string
          delay_minutes: number | null
          executed_count: number | null
          id: string
          is_active: boolean | null
          step_number: number
          touchpoint_type: string
        }
        Insert: {
          campaign_id?: string | null
          conditions?: Json | null
          content?: Json | null
          created_at?: string
          delay_minutes?: number | null
          executed_count?: number | null
          id?: string
          is_active?: boolean | null
          step_number: number
          touchpoint_type: string
        }
        Update: {
          campaign_id?: string | null
          conditions?: Json | null
          content?: Json | null
          created_at?: string
          delay_minutes?: number | null
          executed_count?: number | null
          id?: string
          is_active?: boolean | null
          step_number?: number
          touchpoint_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_touchpoints_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "warm_nurture_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          category: string | null
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          priority: number | null
          status: string
          task_name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          status?: string
          task_name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          status?: string
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_agent: string | null
          blocked_reason: string | null
          brief: Json | null
          completed_at: string | null
          created_at: string
          deadline: string | null
          depends_on_tasks: Json | null
          description: string | null
          discussion_thread: Json | null
          id: string
          output: Json | null
          output_type: string | null
          priority: number
          progress_notes: string | null
          quality_score: number | null
          required_skill_tags: Json | null
          requires_approval: boolean | null
          source_agent: string
          source_request_id: string | null
          started_at: string | null
          status: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_agent?: string | null
          blocked_reason?: string | null
          brief?: Json | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          depends_on_tasks?: Json | null
          description?: string | null
          discussion_thread?: Json | null
          id?: string
          output?: Json | null
          output_type?: string | null
          priority?: number
          progress_notes?: string | null
          quality_score?: number | null
          required_skill_tags?: Json | null
          requires_approval?: boolean | null
          source_agent: string
          source_request_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_agent?: string | null
          blocked_reason?: string | null
          brief?: Json | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          depends_on_tasks?: Json | null
          description?: string | null
          discussion_thread?: Json | null
          id?: string
          output?: Json | null
          output_type?: string | null
          priority?: number
          progress_notes?: string | null
          quality_score?: number | null
          required_skill_tags?: Json | null
          requires_approval?: boolean | null
          source_agent?: string
          source_request_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      phone_numbers: {
        Row: {
          assigned_to: string | null
          capabilities: Json | null
          created_at: string
          friendly_name: string | null
          id: string
          monthly_cost: number | null
          phone_number: string
          provider: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: string
          monthly_cost?: number | null
          phone_number: string
          provider?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: string
          monthly_cost?: number | null
          phone_number?: string
          provider?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          action_type: string
          agent_name: string | null
          description: string | null
          duration_ms: number | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          request_snapshot: Json | null
          response_snapshot: Json | null
          success: boolean | null
          tenant_id: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          agent_name?: string | null
          description?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          request_snapshot?: Json | null
          response_snapshot?: Json | null
          success?: boolean | null
          tenant_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          agent_name?: string | null
          description?: string | null
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          request_snapshot?: Json | null
          response_snapshot?: Json | null
          success?: boolean | null
          tenant_id?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_configurations: {
        Row: {
          client_id: string
          config_key: string
          config_value: Json
          created_at: string
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          client_id: string
          config_key: string
          config_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          config_key?: string
          config_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_configurations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          preferences: Json | null
          role: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_program: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          referral_code: string | null
          referred_client_id: string | null
          referred_email: string
          referrer_client_id: string
          reward_amount: number | null
          reward_paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          referred_client_id?: string | null
          referred_email: string
          referrer_client_id: string
          reward_amount?: number | null
          reward_paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          referred_client_id?: string | null
          referred_email?: string
          referrer_client_id?: string
          reward_amount?: number | null
          reward_paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_program_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_program_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_memory: {
        Row: {
          content: string
          context: Json | null
          created_at: string | null
          id: string
          importance_score: number | null
          last_referenced_at: string | null
          memory_type: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          context?: Json | null
          created_at?: string | null
          id?: string
          importance_score?: number | null
          last_referenced_at?: string | null
          memory_type: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          importance_score?: number | null
          last_referenced_at?: string | null
          memory_type?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_memory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_attribution: {
        Row: {
          agent_contributions: Json | null
          attribution_source: string | null
          campaign_id: string | null
          client_id: string | null
          created_at: string
          currency: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          revenue_amount: number
          revenue_type: string | null
          stripe_payment_id: string | null
          touchpoints: Json | null
        }
        Insert: {
          agent_contributions?: Json | null
          attribution_source?: string | null
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          revenue_amount: number
          revenue_type?: string | null
          stripe_payment_id?: string | null
          touchpoints?: Json | null
        }
        Update: {
          agent_contributions?: Json | null
          attribution_source?: string | null
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          revenue_amount?: number
          revenue_type?: string | null
          stripe_payment_id?: string | null
          touchpoints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_attribution_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_attribution_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      rules_of_engagement: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          id: string
          is_active: boolean
          priority: number
          rule_name: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name: string
          rule_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      scenario_simulations: {
        Row: {
          assumptions: string[] | null
          baseline_metrics: Json | null
          conclusion: string | null
          confidence_interval: Json | null
          created_at: string
          id: string
          input_parameters: Json
          projected_outcomes: Json | null
          recommended_action: string | null
          scenario_name: string
          scenario_type: string | null
        }
        Insert: {
          assumptions?: string[] | null
          baseline_metrics?: Json | null
          conclusion?: string | null
          confidence_interval?: Json | null
          created_at?: string
          id?: string
          input_parameters?: Json
          projected_outcomes?: Json | null
          recommended_action?: string | null
          scenario_name: string
          scenario_type?: string | null
        }
        Update: {
          assumptions?: string[] | null
          baseline_metrics?: Json | null
          conclusion?: string | null
          confidence_interval?: Json | null
          created_at?: string
          id?: string
          input_parameters?: Json
          projected_outcomes?: Json | null
          recommended_action?: string | null
          scenario_name?: string
          scenario_type?: string | null
        }
        Relationships: []
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
      scraped_prospects: {
        Row: {
          address: string | null
          business_name: string | null
          categories: string[] | null
          city: string | null
          competitor_of: string | null
          consent_status: string | null
          contact_name: string | null
          converted_to_lead_id: string | null
          created_at: string | null
          do_not_contact: boolean | null
          email: string | null
          id: string
          intent_score: number | null
          is_verified: boolean | null
          outreach_channel: string | null
          outreach_priority: number | null
          outreach_status: string | null
          pain_signals: string[] | null
          phone: string | null
          phone_type: string | null
          place_id: string | null
          rating: number | null
          review_count: number | null
          scraped_at: string | null
          source: string
          source_url: string | null
          state: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          categories?: string[] | null
          city?: string | null
          competitor_of?: string | null
          consent_status?: string | null
          contact_name?: string | null
          converted_to_lead_id?: string | null
          created_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          id?: string
          intent_score?: number | null
          is_verified?: boolean | null
          outreach_channel?: string | null
          outreach_priority?: number | null
          outreach_status?: string | null
          pain_signals?: string[] | null
          phone?: string | null
          phone_type?: string | null
          place_id?: string | null
          rating?: number | null
          review_count?: number | null
          scraped_at?: string | null
          source: string
          source_url?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          categories?: string[] | null
          city?: string | null
          competitor_of?: string | null
          consent_status?: string | null
          contact_name?: string | null
          converted_to_lead_id?: string | null
          created_at?: string | null
          do_not_contact?: boolean | null
          email?: string | null
          id?: string
          intent_score?: number | null
          is_verified?: boolean | null
          outreach_channel?: string | null
          outreach_priority?: number | null
          outreach_status?: string | null
          pain_signals?: string[] | null
          phone?: string | null
          phone_type?: string | null
          place_id?: string | null
          rating?: number | null
          review_count?: number | null
          scraped_at?: string | null
          source?: string
          source_url?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_prospects_converted_to_lead_id_fkey"
            columns: ["converted_to_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      security_lockdowns: {
        Row: {
          agent_type: string
          id: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          started_at: string
          status: string
          triggered_value: number | null
        }
        Insert: {
          agent_type: string
          id?: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          started_at?: string
          status?: string
          triggered_value?: number | null
        }
        Update: {
          agent_type?: string
          id?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          started_at?: string
          status?: string
          triggered_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "security_lockdowns_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "lockdown_rules"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_credentials: {
        Row: {
          connection_status: string | null
          consecutive_failures: number | null
          created_at: string | null
          credential_type: string
          encrypted_value: string
          encryption_key_version: number | null
          id: string
          last_health_check: string | null
          last_used_at: string | null
          last_used_by_agent: string | null
          oauth_access_token: string | null
          oauth_expires_at: string | null
          oauth_refresh_token: string | null
          oauth_scopes: string[] | null
          service_key: string
          total_usage_count: number | null
          updated_at: string | null
        }
        Insert: {
          connection_status?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          credential_type: string
          encrypted_value: string
          encryption_key_version?: number | null
          id?: string
          last_health_check?: string | null
          last_used_at?: string | null
          last_used_by_agent?: string | null
          oauth_access_token?: string | null
          oauth_expires_at?: string | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          service_key: string
          total_usage_count?: number | null
          updated_at?: string | null
        }
        Update: {
          connection_status?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          credential_type?: string
          encrypted_value?: string
          encryption_key_version?: number | null
          id?: string
          last_health_check?: string | null
          last_used_at?: string | null
          last_used_by_agent?: string | null
          oauth_access_token?: string | null
          oauth_expires_at?: string | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          service_key?: string
          total_usage_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_registry: {
        Row: {
          auth_method: string
          category: string
          created_at: string | null
          credential_fields: Json | null
          description: string | null
          display_name: string
          documentation_url: string | null
          icon_emoji: string | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          oauth_authorize_url: string | null
          oauth_scopes_available: string[] | null
          oauth_scopes_required: string[] | null
          oauth_token_url: string | null
          priority_order: number | null
          service_key: string
          setup_instructions: Json | null
          test_endpoint: string | null
          test_method: string | null
          updated_at: string | null
        }
        Insert: {
          auth_method: string
          category: string
          created_at?: string | null
          credential_fields?: Json | null
          description?: string | null
          display_name: string
          documentation_url?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          oauth_authorize_url?: string | null
          oauth_scopes_available?: string[] | null
          oauth_scopes_required?: string[] | null
          oauth_token_url?: string | null
          priority_order?: number | null
          service_key: string
          setup_instructions?: Json | null
          test_endpoint?: string | null
          test_method?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_method?: string
          category?: string
          created_at?: string | null
          credential_fields?: Json | null
          description?: string | null
          display_name?: string
          documentation_url?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          oauth_authorize_url?: string | null
          oauth_scopes_available?: string[] | null
          oauth_scopes_required?: string[] | null
          oauth_token_url?: string | null
          priority_order?: number | null
          service_key?: string
          setup_instructions?: Json | null
          test_endpoint?: string | null
          test_method?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_relationships: {
        Row: {
          created_at: string | null
          id: string
          priority: number | null
          reason: string | null
          relationship_type: string
          source_service: string
          target_service: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          priority?: number | null
          reason?: string | null
          relationship_type: string
          source_service: string
          target_service: string
        }
        Update: {
          created_at?: string | null
          id?: string
          priority?: number | null
          reason?: string | null
          relationship_type?: string
          source_service?: string
          target_service?: string
        }
        Relationships: []
      }
      sms_campaign_recipients: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          external_message_id: string | null
          id: string
          phone_number: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_unified"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          campaign_type: string | null
          created_at: string
          delivered_count: number | null
          failed_count: number | null
          id: string
          message: string
          name: string
          opt_out_count: number | null
          phone_number_id: string | null
          reply_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          status: string | null
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          campaign_type?: string | null
          created_at?: string
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message: string
          name: string
          opt_out_count?: number | null
          phone_number_id?: string | null
          reply_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          campaign_type?: string | null
          created_at?: string
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message?: string
          name?: string
          opt_out_count?: number | null
          phone_number_id?: string | null
          reply_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_keywords: {
        Row: {
          auto_tag: string | null
          created_at: string | null
          funnel_id: string | null
          id: string
          is_active: boolean | null
          keyword: string
          lead_magnet_url: string | null
          response_message: string
          updated_at: string | null
          uses_count: number | null
        }
        Insert: {
          auto_tag?: string | null
          created_at?: string | null
          funnel_id?: string | null
          id?: string
          is_active?: boolean | null
          keyword: string
          lead_magnet_url?: string | null
          response_message: string
          updated_at?: string | null
          uses_count?: number | null
        }
        Update: {
          auto_tag?: string | null
          created_at?: string | null
          funnel_id?: string | null
          id?: string
          is_active?: boolean | null
          keyword?: string
          lead_magnet_url?: string | null
          response_message?: string
          updated_at?: string | null
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_keywords_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_opt_outs: {
        Row: {
          id: string
          opted_out_at: string
          phone_number: string
          reason: string | null
          source: string | null
        }
        Insert: {
          id?: string
          opted_out_at?: string
          phone_number: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          id?: string
          opted_out_at?: string
          phone_number?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      strategic_goals: {
        Row: {
          ai_generated: boolean | null
          created_at: string
          current_value: number | null
          deadline: string | null
          description: string | null
          goal_type: string | null
          id: string
          owner: string | null
          parent_goal_id: string | null
          progress_percentage: number | null
          status: string | null
          target_metric: string | null
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          goal_type?: string | null
          id?: string
          owner?: string | null
          parent_goal_id?: string | null
          progress_percentage?: number | null
          status?: string | null
          target_metric?: string | null
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string
          current_value?: number | null
          deadline?: string | null
          description?: string | null
          goal_type?: string | null
          id?: string
          owner?: string | null
          parent_goal_id?: string | null
          progress_percentage?: number | null
          status?: string | null
          target_metric?: string | null
          target_value?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "strategic_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_recommendations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence_score: number | null
          created_at: string
          description: string | null
          expected_impact: Json | null
          id: string
          implementation_notes: string | null
          outcome_data: Json | null
          priority: string | null
          recommendation_type: string | null
          source_analysis: string | null
          status: string | null
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          expected_impact?: Json | null
          id?: string
          implementation_notes?: string | null
          outcome_data?: Json | null
          priority?: string | null
          recommendation_type?: string | null
          source_analysis?: string | null
          status?: string | null
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          expected_impact?: Json | null
          id?: string
          implementation_notes?: string | null
          outcome_data?: Json | null
          priority?: string | null
          recommendation_type?: string | null
          source_analysis?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      stripe_products: {
        Row: {
          billing_interval: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          metered_usage_type: string | null
          name: string
          pricing_type: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          unit_amount: number | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          metered_usage_type?: string | null
          name: string
          pricing_type?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          unit_amount?: number | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          metered_usage_type?: string | null
          name?: string
          pricing_type?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          unit_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          agent_limits: Json | null
          created_at: string | null
          display_name: string
          features_json: Json
          id: string
          is_active: boolean | null
          plan_key: string
          price_monthly_cents: number | null
        }
        Insert: {
          agent_limits?: Json | null
          created_at?: string | null
          display_name: string
          features_json?: Json
          id?: string
          is_active?: boolean | null
          plan_key: string
          price_monthly_cents?: number | null
        }
        Update: {
          agent_limits?: Json | null
          created_at?: string | null
          display_name?: string
          features_json?: Json
          id?: string
          is_active?: boolean | null
          plan_key?: string
          price_monthly_cents?: number | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_health: {
        Row: {
          id: string
          metric_name: string
          metric_unit: string | null
          metric_value: number
          recorded_at: string
          status: string | null
          threshold_critical: number | null
          threshold_warning: number | null
        }
        Insert: {
          id?: string
          metric_name: string
          metric_unit?: string | null
          metric_value: number
          recorded_at?: string
          status?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
        }
        Update: {
          id?: string
          metric_name?: string
          metric_unit?: string | null
          metric_value?: number
          recorded_at?: string
          status?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
        }
        Relationships: []
      }
      system_modes: {
        Row: {
          activated_at: string
          activated_by: string | null
          auto_revert_at: string | null
          created_at: string
          id: string
          mode: string
          previous_mode: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          auto_revert_at?: string | null
          created_at?: string
          id?: string
          mode?: string
          previous_mode?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          auto_revert_at?: string | null
          created_at?: string
          id?: string
          mode?: string
          previous_mode?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_scaling_events: {
        Row: {
          agent_type: string
          cost_impact_estimate: number | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          new_instances: number | null
          previous_instances: number | null
          trigger_reason: string | null
        }
        Insert: {
          agent_type: string
          cost_impact_estimate?: number | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_instances?: number | null
          previous_instances?: number | null
          trigger_reason?: string | null
        }
        Update: {
          agent_type?: string
          cost_impact_estimate?: number | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_instances?: number | null
          previous_instances?: number | null
          trigger_reason?: string | null
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string | null
          features_enabled: Json | null
          id: string
          is_active: boolean | null
          name: string
          owner_user_id: string | null
          settings: Json | null
          slug: string
          subscription_plan: string | null
          update_channel: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          features_enabled?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          owner_user_id?: string | null
          settings?: Json | null
          slug: string
          subscription_plan?: string | null
          update_channel?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          features_enabled?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          owner_user_id?: string | null
          settings?: Json | null
          slug?: string
          subscription_plan?: string | null
          update_channel?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          client_id: string
          created_at: string
          id: string
          metadata: Json | null
          quantity: number
          recorded_at: string
          source: string | null
          stripe_usage_record_id: string | null
          total_cost: number | null
          unit_price: number
          usage_type: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          client_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          quantity?: number
          recorded_at?: string
          source?: string | null
          stripe_usage_record_id?: string | null
          total_cost?: number | null
          unit_price?: number
          usage_type: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          client_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          quantity?: number
          recorded_at?: string
          source?: string | null
          stripe_usage_record_id?: string | null
          total_cost?: number | null
          unit_price?: number
          usage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consent: {
        Row: {
          consent_version: string | null
          consented_at: string | null
          created_at: string | null
          enhanced_analytics: boolean | null
          id: string
          ip_address: string | null
          marketing_emails: boolean | null
          personalization: boolean | null
          updated_at: string | null
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          consent_version?: string | null
          consented_at?: string | null
          created_at?: string | null
          enhanced_analytics?: boolean | null
          id?: string
          ip_address?: string | null
          marketing_emails?: boolean | null
          personalization?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          consent_version?: string | null
          consented_at?: string | null
          created_at?: string | null
          enhanced_analytics?: boolean | null
          id?: string
          ip_address?: string | null
          marketing_emails?: boolean | null
          personalization?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      user_directives: {
        Row: {
          action_required: boolean | null
          action_taken: boolean | null
          content: string
          created_at: string | null
          handled_by: string | null
          id: string
          input_type: string | null
          intent: string | null
          metadata: Json | null
          priority: string | null
          processed_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          source: string
          updated_at: string | null
        }
        Insert: {
          action_required?: boolean | null
          action_taken?: boolean | null
          content: string
          created_at?: string | null
          handled_by?: string | null
          id?: string
          input_type?: string | null
          intent?: string | null
          metadata?: Json | null
          priority?: string | null
          processed_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source: string
          updated_at?: string | null
        }
        Update: {
          action_required?: boolean | null
          action_taken?: boolean | null
          content?: string
          created_at?: string | null
          handled_by?: string | null
          id?: string
          input_type?: string | null
          intent?: string | null
          metadata?: Json | null
          priority?: string | null
          processed_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_patterns: {
        Row: {
          action_payload: Json | null
          action_type: string
          confidence_score: number | null
          created_at: string | null
          hit_count: number | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          miss_count: number | null
          trigger_details: Json | null
          trigger_type: string
          updated_at: string | null
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          action_payload?: Json | null
          action_type: string
          confidence_score?: number | null
          created_at?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          miss_count?: number | null
          trigger_details?: Json | null
          trigger_type: string
          updated_at?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          action_payload?: Json | null
          action_type?: string
          confidence_score?: number | null
          created_at?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          miss_count?: number | null
          trigger_details?: Json | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          celebration_preference: string | null
          communication_style: string | null
          created_at: string | null
          id: string
          notification_preferences: Json | null
          preferred_name: string | null
          tenant_id: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
          working_hours: Json | null
        }
        Insert: {
          celebration_preference?: string | null
          communication_style?: string | null
          created_at?: string | null
          id?: string
          notification_preferences?: Json | null
          preferred_name?: string | null
          tenant_id?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          working_hours?: Json | null
        }
        Update: {
          celebration_preference?: string | null
          communication_style?: string | null
          created_at?: string | null
          id?: string
          notification_preferences?: Json | null
          preferred_name?: string | null
          tenant_id?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
      video_assets: {
        Row: {
          asset_type: string
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          metadata: Json | null
          mime_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          asset_type: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_type?: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      video_generation_events: {
        Row: {
          ai_decision_reason: string | null
          cost_cents: number | null
          created_at: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_from: string | null
          id: string
          latency_ms: number | null
          project_id: string | null
          provider: string
          quality_score: number | null
          request_params: Json | null
          status: string | null
          video_id: string | null
        }
        Insert: {
          ai_decision_reason?: string | null
          cost_cents?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          fallback_from?: string | null
          id?: string
          latency_ms?: number | null
          project_id?: string | null
          provider: string
          quality_score?: number | null
          request_params?: Json | null
          status?: string | null
          video_id?: string | null
        }
        Update: {
          ai_decision_reason?: string | null
          cost_cents?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          fallback_from?: string | null
          id?: string
          latency_ms?: number | null
          project_id?: string | null
          provider?: string
          quality_score?: number | null
          request_params?: Json | null
          status?: string | null
          video_id?: string | null
        }
        Relationships: []
      }
      video_project_items: {
        Row: {
          asset_id: string | null
          content: string | null
          created_at: string | null
          duration_ms: number
          id: string
          item_type: string
          layer_props: Json | null
          project_id: string
          start_time_ms: number
          track_index: number | null
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          content?: string | null
          created_at?: string | null
          duration_ms?: number
          id?: string
          item_type: string
          layer_props?: Json | null
          project_id: string
          start_time_ms?: number
          track_index?: number | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          content?: string | null
          created_at?: string | null
          duration_ms?: number
          id?: string
          item_type?: string
          layer_props?: Json | null
          project_id?: string
          start_time_ms?: number
          track_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_project_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_projects: {
        Row: {
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          quality_check_passed: boolean | null
          quality_check_result: Json | null
          render_url: string | null
          settings: Json | null
          status: string | null
          template_id: string | null
          thumbnail_url: string | null
          title: string
          total_cost_cents: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          quality_check_passed?: boolean | null
          quality_check_result?: Json | null
          render_url?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_url?: string | null
          title: string
          total_cost_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          quality_check_passed?: boolean | null
          quality_check_result?: Json | null
          render_url?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_url?: string | null
          title?: string
          total_cost_cents?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      video_provider_config: {
        Row: {
          api_key_configured: boolean | null
          capabilities: Json | null
          cost_per_second_cents: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_duration_seconds: number | null
          priority: number | null
          provider: string
          quality_score: number | null
          updated_at: string | null
        }
        Insert: {
          api_key_configured?: boolean | null
          capabilities?: Json | null
          cost_per_second_cents?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_duration_seconds?: number | null
          priority?: number | null
          provider: string
          quality_score?: number | null
          updated_at?: string | null
        }
        Update: {
          api_key_configured?: boolean | null
          capabilities?: Json | null
          cost_per_second_cents?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_duration_seconds?: number | null
          priority?: number | null
          provider?: string
          quality_score?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      video_provider_health: {
        Row: {
          auto_disable_threshold: number | null
          avg_latency_ms: number | null
          consecutive_failures: number | null
          created_at: string | null
          id: string
          is_auto_disabled: boolean | null
          last_failure_at: string | null
          last_health_check_at: string | null
          last_success_at: string | null
          provider: string
          status: string | null
          success_rate: number | null
          total_cost_cents: number | null
          total_failures: number | null
          total_seconds_generated: number | null
          total_videos_generated: number | null
          updated_at: string | null
        }
        Insert: {
          auto_disable_threshold?: number | null
          avg_latency_ms?: number | null
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          is_auto_disabled?: boolean | null
          last_failure_at?: string | null
          last_health_check_at?: string | null
          last_success_at?: string | null
          provider: string
          status?: string | null
          success_rate?: number | null
          total_cost_cents?: number | null
          total_failures?: number | null
          total_seconds_generated?: number | null
          total_videos_generated?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_disable_threshold?: number | null
          avg_latency_ms?: number | null
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          is_auto_disabled?: boolean | null
          last_failure_at?: string | null
          last_health_check_at?: string | null
          last_success_at?: string | null
          provider?: string
          status?: string | null
          success_rate?: number | null
          total_cost_cents?: number | null
          total_failures?: number | null
          total_seconds_generated?: number | null
          total_videos_generated?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      video_templates: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          duration_estimate_seconds: number | null
          id: string
          is_system: boolean | null
          name: string
          structure: Json
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_estimate_seconds?: number | null
          id?: string
          is_system?: boolean | null
          name: string
          structure?: Json
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_estimate_seconds?: number | null
          id?: string
          is_system?: boolean | null
          name?: string
          structure?: Json
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
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
      voicemail_drops: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          name: string
          times_used: number | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          times_used?: number | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          times_used?: number | null
        }
        Relationships: []
      }
      warm_nurture_campaigns: {
        Row: {
          converted_count: number | null
          created_at: string
          description: string | null
          enrolled_count: number | null
          id: string
          name: string
          status: string | null
          trigger_conditions: Json | null
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          converted_count?: number | null
          created_at?: string
          description?: string | null
          enrolled_count?: number | null
          id?: string
          name: string
          status?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          converted_count?: number | null
          created_at?: string
          description?: string | null
          enrolled_count?: number | null
          id?: string
          name?: string
          status?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_feature_access: {
        Args: { check_tenant_id: string; feature: string }
        Returns: boolean
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_belongs_to_tenant: {
        Args: { check_tenant_id: string }
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
