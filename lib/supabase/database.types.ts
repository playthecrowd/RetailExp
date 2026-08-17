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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brand_settings: {
        Row: {
          client_id: string
          created_at: string
          id: string
          logo_asset_id: string | null
          primary_color: string | null
          secondary_color: string | null
          terminology_overrides: Json | null
          typography: Json | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          logo_asset_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          terminology_overrides?: Json | null
          typography?: Json | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          logo_asset_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          terminology_overrides?: Json | null
          typography?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_settings_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      choices: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          description: string | null
          destination_node_id: string | null
          display_order: number
          id: string
          preview_video_asset_id: string | null
          source_node_id: string
          thumbnail_asset_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          description?: string | null
          destination_node_id?: string | null
          display_order?: number
          id?: string
          preview_video_asset_id?: string | null
          source_node_id: string
          thumbnail_asset_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          description?: string | null
          destination_node_id?: string | null
          display_order?: number
          id?: string
          preview_video_asset_id?: string | null
          source_node_id?: string
          thumbnail_asset_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "choices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "choices_destination_node_id_fkey"
            columns: ["destination_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "choices_preview_video_asset_id_fkey"
            columns: ["preview_video_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "choices_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "choices_thumbnail_asset_id_fkey"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          created_at: string
          custom_domain: string | null
          id: string
          logo_asset_id: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_asset_id?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_asset_id?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      content_nodes: {
        Row: {
          branch_code: string | null
          captions_asset_id: string | null
          chapter_label: string | null
          chapter_number: number | null
          client_id: string
          created_at: string
          decision_timing: Json | null
          description: string | null
          duration_seconds: number | null
          experience_id: string
          id: string
          internal_name: string
          is_root: boolean
          is_terminal: boolean
          node_type: Database["public"]["Enums"]["content_node_type"]
          parent_node_id: string | null
          pathway_id: string | null
          poster_asset_id: string | null
          primary_video_asset_id: string | null
          processing_status: Database["public"]["Enums"]["processing_status"]
          publication_status: Database["public"]["Enums"]["publication_status"]
          sort_order: number
          thumbnail_asset_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          branch_code?: string | null
          captions_asset_id?: string | null
          chapter_label?: string | null
          chapter_number?: number | null
          client_id: string
          created_at?: string
          decision_timing?: Json | null
          description?: string | null
          duration_seconds?: number | null
          experience_id: string
          id?: string
          internal_name: string
          is_root?: boolean
          is_terminal?: boolean
          node_type?: Database["public"]["Enums"]["content_node_type"]
          parent_node_id?: string | null
          pathway_id?: string | null
          poster_asset_id?: string | null
          primary_video_asset_id?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          publication_status?: Database["public"]["Enums"]["publication_status"]
          sort_order?: number
          thumbnail_asset_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          branch_code?: string | null
          captions_asset_id?: string | null
          chapter_label?: string | null
          chapter_number?: number | null
          client_id?: string
          created_at?: string
          decision_timing?: Json | null
          description?: string | null
          duration_seconds?: number | null
          experience_id?: string
          id?: string
          internal_name?: string
          is_root?: boolean
          is_terminal?: boolean
          node_type?: Database["public"]["Enums"]["content_node_type"]
          parent_node_id?: string | null
          pathway_id?: string | null
          poster_asset_id?: string | null
          primary_video_asset_id?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          publication_status?: Database["public"]["Enums"]["publication_status"]
          sort_order?: number
          thumbnail_asset_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_nodes_captions_asset_id_fkey"
            columns: ["captions_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_poster_asset_id_fkey"
            columns: ["poster_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_primary_video_asset_id_fkey"
            columns: ["primary_video_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_nodes_thumbnail_asset_id_fkey"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_events: {
        Row: {
          client_id: string
          event_payload: Json | null
          event_type: string
          experience_id: string
          experience_user_id: string | null
          id: string
          occurred_at: string
        }
        Insert: {
          client_id: string
          event_payload?: Json | null
          event_type: string
          experience_id: string
          experience_user_id?: string | null
          id?: string
          occurred_at?: string
        }
        Update: {
          client_id?: string
          event_payload?: Json | null
          event_type?: string
          experience_id?: string
          experience_user_id?: string | null
          id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_experience_user_id_fkey"
            columns: ["experience_user_id"]
            isOneToOne: false
            referencedRelation: "experience_users"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_user_rewards: {
        Row: {
          claimed_at: string | null
          client_id: string
          experience_user_id: string
          id: string
          points_awarded: number
          reward_key: string
          status: string
          unlocked_at: string
        }
        Insert: {
          claimed_at?: string | null
          client_id: string
          experience_user_id: string
          id?: string
          points_awarded?: number
          reward_key: string
          status?: string
          unlocked_at?: string
        }
        Update: {
          claimed_at?: string | null
          client_id?: string
          experience_user_id?: string
          id?: string
          points_awarded?: number
          reward_key?: string
          status?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_user_rewards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_user_rewards_experience_user_id_fkey"
            columns: ["experience_user_id"]
            isOneToOne: false
            referencedRelation: "experience_users"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_users: {
        Row: {
          auth_user_id: string | null
          client_id: string
          created_at: string
          display_name: string | null
          email: string | null
          experience_id: string
          id: string
          phone_e164: string | null
        }
        Insert: {
          auth_user_id?: string | null
          client_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience_id: string
          id?: string
          phone_e164?: string | null
        }
        Update: {
          auth_user_id?: string | null
          client_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience_id?: string
          id?: string
          phone_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_users_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          ar_lens_group_id: string | null
          ar_lens_id: string | null
          ar_provider: string | null
          client_id: string
          commercial_content_node_id: string | null
          created_at: string
          current_version_id: string | null
          experience_type: string
          id: string
          name: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          signup_required: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          ar_lens_group_id?: string | null
          ar_lens_id?: string | null
          ar_provider?: string | null
          client_id: string
          commercial_content_node_id?: string | null
          created_at?: string
          current_version_id?: string | null
          experience_type?: string
          id?: string
          name: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          signup_required?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          ar_lens_group_id?: string | null
          ar_lens_id?: string | null
          ar_provider?: string | null
          client_id?: string
          commercial_content_node_id?: string | null
          created_at?: string
          current_version_id?: string | null
          experience_type?: string
          id?: string
          name?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          signup_required?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_commercial_content_node_id_fkey"
            columns: ["commercial_content_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "publication_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_progress: {
        Row: {
          client_id: string
          completed_node_ids: Json
          current_node_elapsed_seconds: number
          current_node_id: string | null
          experience_user_id: string
          history: Json
          id: string
          last_updated_at: string
          pathway_id: string | null
          player_status: Database["public"]["Enums"]["player_status"]
        }
        Insert: {
          client_id: string
          completed_node_ids?: Json
          current_node_elapsed_seconds?: number
          current_node_id?: string | null
          experience_user_id: string
          history?: Json
          id?: string
          last_updated_at?: string
          pathway_id?: string | null
          player_status?: Database["public"]["Enums"]["player_status"]
        }
        Update: {
          client_id?: string
          completed_node_ids?: Json
          current_node_elapsed_seconds?: number
          current_node_id?: string | null
          experience_user_id?: string
          history?: Json
          id?: string
          last_updated_at?: string
          pathway_id?: string | null
          player_status?: Database["public"]["Enums"]["player_status"]
        }
        Relationships: [
          {
            foreignKeyName: "journey_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_progress_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_progress_experience_user_id_fkey"
            columns: ["experience_user_id"]
            isOneToOne: false
            referencedRelation: "experience_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_progress_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          checksum: string | null
          client_id: string
          created_at: string
          duration_seconds: number | null
          experience_id: string | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_placeholder: boolean
          is_source_master: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          mime_type: string | null
          processing_status: Database["public"]["Enums"]["processing_status"]
          public_url: string | null
          role: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          version: number
          width: number | null
        }
        Insert: {
          checksum?: string | null
          client_id: string
          created_at?: string
          duration_seconds?: number | null
          experience_id?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          is_source_master?: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          mime_type?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          public_url?: string | null
          role?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          width?: number | null
        }
        Update: {
          checksum?: string | null
          client_id?: string
          created_at?: string
          duration_seconds?: number | null
          experience_id?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          is_source_master?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          mime_type?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          public_url?: string | null
          role?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      pathways: {
        Row: {
          accent_color: string | null
          created_at: string
          description: string | null
          experience_id: string
          id: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          root_node_id: string | null
          slug: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          description?: string | null
          experience_id: string
          id?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          root_node_id?: string | null
          slug: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          description?: string | null
          experience_id?: string
          id?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          root_node_id?: string | null
          slug?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathways_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathways_root_node_id_fkey"
            columns: ["root_node_id"]
            isOneToOne: false
            referencedRelation: "content_nodes"
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
          is_platform_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      publication_versions: {
        Row: {
          created_at: string
          experience_id: string
          id: string
          published_at: string | null
          published_by: string | null
          snapshot: Json | null
          status: Database["public"]["Enums"]["publication_status"]
          version_number: number
        }
        Insert: {
          created_at?: string
          experience_id: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot?: Json | null
          status?: Database["public"]["Enums"]["publication_status"]
          version_number: number
        }
        Update: {
          created_at?: string
          experience_id?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot?: Json | null
          status?: Database["public"]["Enums"]["publication_status"]
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "publication_versions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_client: { Args: { check_client_id: string }; Returns: boolean }
      can_manage_members: {
        Args: { check_client_id: string }
        Returns: boolean
      }
      can_view_experience_user_pii: {
        Args: { check_client_id: string }
        Returns: boolean
      }
      is_client_member: { Args: { check_client_id: string }; Returns: boolean }
      is_client_owner: { Args: { check_client_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      client_status: "active" | "inactive" | "archived"
      content_node_type:
        | "commercial"
        | "ar_intro"
        | "pathway_chapter"
        | "journey_completion"
        | "other"
      media_type: "video" | "image" | "captions" | "audio"
      membership_role: "owner" | "admin" | "editor" | "viewer"
      player_status:
        | "not_started"
        | "playing"
        | "awaiting_choice"
        | "terminal_complete"
      processing_status: "pending" | "processing" | "ready" | "failed"
      publication_status: "draft" | "published" | "archived"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      client_status: ["active", "inactive", "archived"],
      content_node_type: [
        "commercial",
        "ar_intro",
        "pathway_chapter",
        "journey_completion",
        "other",
      ],
      media_type: ["video", "image", "captions", "audio"],
      membership_role: ["owner", "admin", "editor", "viewer"],
      player_status: [
        "not_started",
        "playing",
        "awaiting_choice",
        "terminal_complete",
      ],
      processing_status: ["pending", "processing", "ready", "failed"],
      publication_status: ["draft", "published", "archived"],
    },
  },
} as const
