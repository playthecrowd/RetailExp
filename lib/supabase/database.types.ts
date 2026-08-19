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
      consent_document_versions: {
        Row: {
          created_at: string
          is_active: boolean
          privacy_url: string
          published_at: string | null
          terms_url: string
          version: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          privacy_url: string
          published_at?: string | null
          terms_url: string
          version: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          privacy_url?: string
          published_at?: string | null
          terms_url?: string
          version?: string
        }
        Relationships: []
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
          video360_asset_id: string | null
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
          video360_asset_id?: string | null
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
          video360_asset_id?: string | null
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
          {
            foreignKeyName: "content_nodes_video360_asset_id_fkey"
            columns: ["video360_asset_id"]
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
          testimonial_capture_enabled: boolean
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
          testimonial_capture_enabled?: boolean
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
          testimonial_capture_enabled?: boolean
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
      testimonial_processing_events: {
        Row: {
          applied: boolean
          applied_at: string | null
          error_code: string | null
          event_type: string
          id: string
          payload_hash: string
          provider: string
          provider_asset_id: string | null
          provider_event_id: string
          received_at: string
          signature_verified_at: string
          submission_id: string | null
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          error_code?: string | null
          event_type: string
          id?: string
          payload_hash: string
          provider: string
          provider_asset_id?: string | null
          provider_event_id: string
          received_at?: string
          signature_verified_at: string
          submission_id?: string | null
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          payload_hash?: string
          provider?: string
          provider_asset_id?: string | null
          provider_event_id?: string
          received_at?: string
          signature_verified_at?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_processing_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_gallery_items"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_processing_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_moderation_queue"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_processing_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_my_submissions"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_processing_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_provider_assets: {
        Row: {
          attached_at: string | null
          attempt_no: number
          deleted_at: string | null
          deletion_attempt_count: number
          deletion_requested_at: string | null
          deletion_status: string | null
          environment_marker: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          last_deletion_attempt_at: string | null
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          opaque_reference: string
          orphaned_at: string | null
          provider: string
          provider_asset_id: string | null
          reservation_expires_at: string
          reserved_at: string
          submission_id: string
          superseded_at: string | null
          validated_at: string | null
        }
        Insert: {
          attached_at?: string | null
          attempt_no: number
          deleted_at?: string | null
          deletion_attempt_count?: number
          deletion_requested_at?: string | null
          deletion_status?: string | null
          environment_marker: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_deletion_attempt_at?: string | null
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          opaque_reference: string
          orphaned_at?: string | null
          provider: string
          provider_asset_id?: string | null
          reservation_expires_at: string
          reserved_at?: string
          submission_id: string
          superseded_at?: string | null
          validated_at?: string | null
        }
        Update: {
          attached_at?: string | null
          attempt_no?: number
          deleted_at?: string | null
          deletion_attempt_count?: number
          deletion_requested_at?: string | null
          deletion_status?: string | null
          environment_marker?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_deletion_attempt_at?: string | null
          media_type?: Database["public"]["Enums"]["testimonial_media_type"]
          opaque_reference?: string
          orphaned_at?: string | null
          provider?: string
          provider_asset_id?: string | null
          reservation_expires_at?: string
          reserved_at?: string
          submission_id?: string
          superseded_at?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_provider_assets_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_gallery_items"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_provider_assets_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_moderation_queue"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_provider_assets_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_my_submissions"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "testimonial_provider_assets_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "testimonial_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_submissions: {
        Row: {
          attested_no_minors: boolean
          attested_subjects_consented: boolean
          attested_submitter_adult: boolean
          auth_user_id: string | null
          caption: string | null
          capture_mode: string
          client_id: string
          client_submission_key: string
          consent_scope: string
          consent_version: string
          consented_at: string
          created_at: string
          delivery_ready_at: string | null
          detected_mime_type: string | null
          environment_marker: string | null
          experience_id: string
          experience_user_id: string
          id: string
          last_provider_event_at: string | null
          last_provider_event_id: string | null
          media_deleted_at: string | null
          media_purge_after: string | null
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          moderation_note: string | null
          moderation_status: Database["public"]["Enums"]["testimonial_moderation_status"]
          poster_ready_at: string | null
          provider: string | null
          provider_asset_id: string | null
          provider_deletion_status: string | null
          provider_delivery_id: string | null
          provider_draft_cleared_at: string | null
          provider_error_code: string | null
          provider_poster_id: string | null
          provider_processing_status: string | null
          provider_signed_urls_required: boolean
          provider_upload_id: string | null
          published_at: string | null
          rejection_reason: string | null
          removed_at: string | null
          reported_duration_seconds: number | null
          reported_mime_type: string | null
          reported_size_bytes: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string | null
          updated_at: string
          upload_attempt_count: number
          upload_expires_at: string
          upload_failure_reason: string | null
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
          uploaded_at: string | null
          validated_at: string | null
          validated_by: string | null
          validated_codec: string | null
          validated_duration_seconds: number | null
          validated_height: number | null
          validated_size_bytes: number | null
          validated_width: number | null
          validation_failure_reason: string | null
          validation_status: Database["public"]["Enums"]["testimonial_validation_status"]
        }
        Insert: {
          attested_no_minors?: boolean
          attested_subjects_consented?: boolean
          attested_submitter_adult?: boolean
          auth_user_id?: string | null
          caption?: string | null
          capture_mode?: string
          client_id: string
          client_submission_key: string
          consent_scope?: string
          consent_version: string
          consented_at: string
          created_at?: string
          delivery_ready_at?: string | null
          detected_mime_type?: string | null
          environment_marker?: string | null
          experience_id: string
          experience_user_id: string
          id?: string
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          media_deleted_at?: string | null
          media_purge_after?: string | null
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          moderation_note?: string | null
          moderation_status?: Database["public"]["Enums"]["testimonial_moderation_status"]
          poster_ready_at?: string | null
          provider?: string | null
          provider_asset_id?: string | null
          provider_deletion_status?: string | null
          provider_delivery_id?: string | null
          provider_draft_cleared_at?: string | null
          provider_error_code?: string | null
          provider_poster_id?: string | null
          provider_processing_status?: string | null
          provider_signed_urls_required?: boolean
          provider_upload_id?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          removed_at?: string | null
          reported_duration_seconds?: number | null
          reported_mime_type?: string | null
          reported_size_bytes?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          updated_at?: string
          upload_attempt_count?: number
          upload_expires_at?: string
          upload_failure_reason?: string | null
          upload_status?: Database["public"]["Enums"]["testimonial_upload_status"]
          uploaded_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validated_codec?: string | null
          validated_duration_seconds?: number | null
          validated_height?: number | null
          validated_size_bytes?: number | null
          validated_width?: number | null
          validation_failure_reason?: string | null
          validation_status?: Database["public"]["Enums"]["testimonial_validation_status"]
        }
        Update: {
          attested_no_minors?: boolean
          attested_subjects_consented?: boolean
          attested_submitter_adult?: boolean
          auth_user_id?: string | null
          caption?: string | null
          capture_mode?: string
          client_id?: string
          client_submission_key?: string
          consent_scope?: string
          consent_version?: string
          consented_at?: string
          created_at?: string
          delivery_ready_at?: string | null
          detected_mime_type?: string | null
          environment_marker?: string | null
          experience_id?: string
          experience_user_id?: string
          id?: string
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          media_deleted_at?: string | null
          media_purge_after?: string | null
          media_type?: Database["public"]["Enums"]["testimonial_media_type"]
          moderation_note?: string | null
          moderation_status?: Database["public"]["Enums"]["testimonial_moderation_status"]
          poster_ready_at?: string | null
          provider?: string | null
          provider_asset_id?: string | null
          provider_deletion_status?: string | null
          provider_delivery_id?: string | null
          provider_draft_cleared_at?: string | null
          provider_error_code?: string | null
          provider_poster_id?: string | null
          provider_processing_status?: string | null
          provider_signed_urls_required?: boolean
          provider_upload_id?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          removed_at?: string | null
          reported_duration_seconds?: number | null
          reported_mime_type?: string | null
          reported_size_bytes?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          updated_at?: string
          upload_attempt_count?: number
          upload_expires_at?: string
          upload_failure_reason?: string | null
          upload_status?: Database["public"]["Enums"]["testimonial_upload_status"]
          uploaded_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validated_codec?: string | null
          validated_duration_seconds?: number | null
          validated_height?: number | null
          validated_size_bytes?: number | null
          validated_width?: number | null
          validation_failure_reason?: string | null
          validation_status?: Database["public"]["Enums"]["testimonial_validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_submissions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_submissions_experience_user_id_fkey"
            columns: ["experience_user_id"]
            isOneToOne: false
            referencedRelation: "experience_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      testimonial_gallery_items: {
        Row: {
          caption: string | null
          delivery_provider: string | null
          duration_seconds: number | null
          experience_id: string | null
          height: number | null
          media_type:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          provider_delivery_id: string | null
          provider_poster_id: string | null
          published_at: string | null
          submission_id: string | null
          width: number | null
        }
        Insert: {
          caption?: string | null
          delivery_provider?: string | null
          duration_seconds?: number | null
          experience_id?: string | null
          height?: number | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          provider_delivery_id?: string | null
          provider_poster_id?: string | null
          published_at?: string | null
          submission_id?: string | null
          width?: number | null
        }
        Update: {
          caption?: string | null
          delivery_provider?: string | null
          duration_seconds?: number | null
          experience_id?: string | null
          height?: number | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          provider_delivery_id?: string | null
          provider_poster_id?: string | null
          published_at?: string | null
          submission_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_submissions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_moderation_queue: {
        Row: {
          attested_no_minors: boolean | null
          attested_subjects_consented: boolean | null
          attested_submitter_adult: boolean | null
          caption: string | null
          client_id: string | null
          consent_scope: string | null
          consent_version: string | null
          delivery_ready_at: string | null
          detected_mime_type: string | null
          experience_id: string | null
          media_purge_after: string | null
          media_type:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_note: string | null
          moderation_status:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          poster_ready_at: string | null
          provider: string | null
          provider_delivery_id: string | null
          provider_poster_id: string | null
          provider_processing_status: string | null
          published_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submission_id: string | null
          submitted_at: string | null
          upload_status:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validated_codec: string | null
          validated_duration_seconds: number | null
          validated_height: number | null
          validated_size_bytes: number | null
          validated_width: number | null
          validation_status:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Insert: {
          attested_no_minors?: boolean | null
          attested_subjects_consented?: boolean | null
          attested_submitter_adult?: boolean | null
          caption?: string | null
          client_id?: string | null
          consent_scope?: string | null
          consent_version?: string | null
          delivery_ready_at?: string | null
          detected_mime_type?: string | null
          experience_id?: string | null
          media_purge_after?: string | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_note?: string | null
          moderation_status?:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          poster_ready_at?: string | null
          provider?: string | null
          provider_delivery_id?: string | null
          provider_poster_id?: string | null
          provider_processing_status?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submission_id?: string | null
          submitted_at?: string | null
          upload_status?:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validated_codec?: string | null
          validated_duration_seconds?: number | null
          validated_height?: number | null
          validated_size_bytes?: number | null
          validated_width?: number | null
          validation_status?:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Update: {
          attested_no_minors?: boolean | null
          attested_subjects_consented?: boolean | null
          attested_submitter_adult?: boolean | null
          caption?: string | null
          client_id?: string | null
          consent_scope?: string | null
          consent_version?: string | null
          delivery_ready_at?: string | null
          detected_mime_type?: string | null
          experience_id?: string | null
          media_purge_after?: string | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_note?: string | null
          moderation_status?:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          poster_ready_at?: string | null
          provider?: string | null
          provider_delivery_id?: string | null
          provider_poster_id?: string | null
          provider_processing_status?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submission_id?: string | null
          submitted_at?: string | null
          upload_status?:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validated_codec?: string | null
          validated_duration_seconds?: number | null
          validated_height?: number | null
          validated_size_bytes?: number | null
          validated_width?: number | null
          validation_status?:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_submissions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_my_submissions: {
        Row: {
          caption: string | null
          media_type:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_status:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          published_at: string | null
          rejection_reason: string | null
          submission_id: string | null
          submitted_at: string | null
          upload_attempt_count: number | null
          upload_expires_at: string | null
          upload_status:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validation_status:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Insert: {
          caption?: string | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_status?:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          published_at?: string | null
          rejection_reason?: string | null
          submission_id?: string | null
          submitted_at?: string | null
          upload_attempt_count?: number | null
          upload_expires_at?: string | null
          upload_status?:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validation_status?:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Update: {
          caption?: string | null
          media_type?:
            | Database["public"]["Enums"]["testimonial_media_type"]
            | null
          moderation_status?:
            | Database["public"]["Enums"]["testimonial_moderation_status"]
            | null
          published_at?: string | null
          rejection_reason?: string | null
          submission_id?: string | null
          submitted_at?: string | null
          upload_attempt_count?: number | null
          upload_expires_at?: string | null
          upload_status?:
            | Database["public"]["Enums"]["testimonial_upload_status"]
            | null
          validation_status?:
            | Database["public"]["Enums"]["testimonial_validation_status"]
            | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_testimonial_submission: {
        Args: { p_submission_id: string; p_visitor_id: string }
        Returns: {
          submission_id: string
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
        }[]
      }
      active_consent_version: { Args: never; Returns: string }
      assert_testimonial_visitor: {
        Args: { p_experience_user_id: string; p_visitor_id: string }
        Returns: undefined
      }
      attach_testimonial_provider_asset: {
        Args: {
          p_ledger_id: string
          p_provider: string
          p_provider_asset_id: string
        }
        Returns: {
          attached_at: string
          ledger_id: string
        }[]
      }
      can_edit_client: { Args: { check_client_id: string }; Returns: boolean }
      can_manage_members: {
        Args: { check_client_id: string }
        Returns: boolean
      }
      can_view_experience_user_pii: {
        Args: { check_client_id: string }
        Returns: boolean
      }
      create_testimonial_intent: {
        Args: {
          p_attested_submitter_adult?: boolean
          p_media_type: Database["public"]["Enums"]["testimonial_media_type"]
          p_visitor_id: string
        }
        Returns: {
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          submission_id: string
          upload_attempt_count: number
          upload_expires_at: string
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
        }[]
      }
      expire_testimonial_upload_intents: {
        Args: { p_limit?: number }
        Returns: {
          submission_id: string
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
        }[]
      }
      fail_testimonial_provider_attempt: {
        Args: { p_ledger_id: string; p_reason: string }
        Returns: {
          failed_at: string
          ledger_id: string
        }[]
      }
      is_client_member: { Args: { check_client_id: string }; Returns: boolean }
      is_client_owner: { Args: { check_client_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      list_deletable_testimonial_provider_assets: {
        Args: { p_environment: string; p_limit?: number }
        Returns: {
          deletion_attempt_count: number
          environment_marker: string
          ledger_id: string
          provider: string
          provider_asset_id: string
          reason: string
        }[]
      }
      list_my_testimonial_submissions: {
        Args: { p_visitor_id: string }
        Returns: {
          caption: string
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          moderation_status: Database["public"]["Enums"]["testimonial_moderation_status"]
          published_at: string
          rejection_reason: string
          submission_id: string
          submitted_at: string
          upload_attempt_count: number
          upload_expires_at: string
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
          validation_status: Database["public"]["Enums"]["testimonial_validation_status"]
        }[]
      }
      list_purgeable_testimonial_submissions: {
        Args: { p_environment: string; p_limit?: number }
        Returns: {
          environment_marker: string
          provider_assets_seen: number
          submission_id: string
        }[]
      }
      mark_testimonial_provider_asset_deleted: {
        Args: { p_ledger_id: string; p_status: string }
        Returns: {
          deletion_attempt_count: number
          deletion_status: string
          ledger_id: string
        }[]
      }
      moderate_testimonial_submission: {
        Args: {
          p_decision: Database["public"]["Enums"]["testimonial_moderation_status"]
          p_moderation_note?: string
          p_rejection_reason?: string
          p_submission_id: string
        }
        Returns: {
          moderation_status: Database["public"]["Enums"]["testimonial_moderation_status"]
          published_at: string
          reviewed_at: string
          submission_id: string
        }[]
      }
      purge_testimonial_media_now: {
        Args: { p_reason: string; p_submission_id: string }
        Returns: {
          media_purge_after: string
          submission_id: string
        }[]
      }
      record_orphaned_testimonial_provider_asset: {
        Args: {
          p_deletion_status: string
          p_ledger_id: string
          p_provider: string
          p_provider_asset_id: string
        }
        Returns: {
          deletion_status: string
          ledger_id: string
          provider_asset_id: string
        }[]
      }
      record_testimonial_media_purged: {
        Args: { p_status: string; p_submission_id: string }
        Returns: {
          media_deleted_at: string
          provider_deletion_status: string
          submission_id: string
        }[]
      }
      record_testimonial_provider_progress: {
        Args: {
          p_error_code: string
          p_event_id: string
          p_opaque_reference: string
          p_processing_status: string
          p_provider: string
          p_provider_asset_id: string
        }
        Returns: {
          recorded: boolean
          submission_id: string
        }[]
      }
      reserve_testimonial_provider_attempt: {
        Args: {
          p_environment: string
          p_expires_at: string
          p_provider: string
          p_submission_id: string
          p_visitor_id: string
        }
        Returns: {
          attempt_no: number
          ledger_id: string
          media_type: Database["public"]["Enums"]["testimonial_media_type"]
          opaque_reference: string
        }[]
      }
      retry_testimonial_upload: {
        Args: { p_submission_id: string; p_visitor_id: string }
        Returns: {
          submission_id: string
          upload_attempt_count: number
          upload_expires_at: string
          upload_status: Database["public"]["Enums"]["testimonial_upload_status"]
        }[]
      }
      update_testimonial_caption: {
        Args: {
          p_caption: string
          p_submission_id: string
          p_visitor_id: string
        }
        Returns: {
          caption: string
          submission_id: string
        }[]
      }
      validate_testimonial_provider_asset: {
        Args: {
          p_duration_seconds: number
          p_event_id: string
          p_height: number
          p_opaque_reference: string
          p_processing_status: string
          p_provider: string
          p_provider_asset_id: string
          p_signed_urls_required: boolean
          p_size_bytes: number
          p_width: number
        }
        Returns: {
          environment_marker: string
          submission_id: string
          validated: boolean
        }[]
      }
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
      testimonial_media_type: "image" | "video"
      testimonial_moderation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "removed"
      testimonial_upload_status:
        | "initiated"
        | "uploaded"
        | "failed"
        | "abandoned"
      testimonial_validation_status: "pending" | "valid" | "invalid"
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
      testimonial_media_type: ["image", "video"],
      testimonial_moderation_status: [
        "pending",
        "approved",
        "rejected",
        "removed",
      ],
      testimonial_upload_status: [
        "initiated",
        "uploaded",
        "failed",
        "abandoned",
      ],
      testimonial_validation_status: ["pending", "valid", "invalid"],
    },
  },
} as const
