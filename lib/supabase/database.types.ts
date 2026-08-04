/**
 * Hand-authored to match supabase/migrations/*.sql exactly, since no live
 * Supabase project exists yet to generate this from (`supabase gen types
 * typescript --project-id ... > lib/supabase/database.types.ts`).
 *
 * Once a real project exists and these migrations have been applied,
 * regenerate this file from the actual database rather than hand-editing
 * it further — that's the source of truth from that point on, this file
 * is only a bridge until then.
 */

export type ClientStatus = "active" | "inactive" | "archived";
export type MembershipRole = "owner" | "admin" | "editor" | "viewer";
export type PublicationStatus = "draft" | "published" | "archived";
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";
export type MediaType = "video" | "image" | "captions" | "audio";
export type ContentNodeType =
  | "commercial"
  | "ar_intro"
  | "pathway_chapter"
  | "journey_completion"
  | "other";
export type PlayerStatus = "not_started" | "playing" | "awaiting_choice" | "terminal_complete";

interface TableDef<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
}

export interface Database {
  public: {
    Tables: {
      clients: TableDef<
        {
          id: string;
          slug: string;
          name: string;
          status: ClientStatus;
          primary_color: string | null;
          secondary_color: string | null;
          logo_asset_id: string | null;
          custom_domain: string | null;
          contact_email: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          slug: string;
          name: string;
          status?: ClientStatus;
          primary_color?: string | null;
          secondary_color?: string | null;
          logo_asset_id?: string | null;
          custom_domain?: string | null;
          contact_email?: string | null;
        },
        Partial<{
          slug: string;
          name: string;
          status: ClientStatus;
          primary_color: string | null;
          secondary_color: string | null;
          logo_asset_id: string | null;
          custom_domain: string | null;
          contact_email: string | null;
        }>
      >;
      profiles: TableDef<
        {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        },
        { id: string; display_name?: string | null; avatar_url?: string | null },
        Partial<{ display_name: string | null; avatar_url: string | null }>
      >;
      client_memberships: TableDef<
        {
          id: string;
          client_id: string;
          user_id: string;
          role: MembershipRole;
          created_at: string;
        },
        { id?: string; client_id: string; user_id: string; role?: MembershipRole },
        Partial<{ role: MembershipRole }>
      >;
      experiences: TableDef<
        {
          id: string;
          client_id: string;
          slug: string;
          name: string;
          experience_type: string;
          commercial_content_node_id: string | null;
          ar_provider: string | null;
          ar_lens_id: string | null;
          ar_lens_group_id: string | null;
          signup_required: boolean;
          publication_status: PublicationStatus;
          current_version_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          client_id: string;
          slug: string;
          name: string;
          experience_type?: string;
          commercial_content_node_id?: string | null;
          ar_provider?: string | null;
          ar_lens_id?: string | null;
          ar_lens_group_id?: string | null;
          signup_required?: boolean;
          publication_status?: PublicationStatus;
          current_version_id?: string | null;
        },
        Partial<{
          slug: string;
          name: string;
          experience_type: string;
          commercial_content_node_id: string | null;
          ar_provider: string | null;
          ar_lens_id: string | null;
          ar_lens_group_id: string | null;
          signup_required: boolean;
          publication_status: PublicationStatus;
          current_version_id: string | null;
        }>
      >;
      pathways: TableDef<
        {
          id: string;
          experience_id: string;
          slug: string;
          title: string;
          subtitle: string | null;
          description: string | null;
          accent_color: string | null;
          root_node_id: string | null;
          sort_order: number;
          publication_status: PublicationStatus;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          experience_id: string;
          slug: string;
          title: string;
          subtitle?: string | null;
          description?: string | null;
          accent_color?: string | null;
          root_node_id?: string | null;
          sort_order?: number;
          publication_status?: PublicationStatus;
        },
        Partial<{
          slug: string;
          title: string;
          subtitle: string | null;
          description: string | null;
          accent_color: string | null;
          root_node_id: string | null;
          sort_order: number;
          publication_status: PublicationStatus;
        }>
      >;
      content_nodes: TableDef<
        {
          id: string;
          client_id: string;
          experience_id: string;
          pathway_id: string | null;
          parent_node_id: string | null;
          node_type: ContentNodeType;
          internal_name: string;
          title: string;
          chapter_label: string | null;
          description: string | null;
          chapter_number: number | null;
          branch_code: string | null;
          is_root: boolean;
          is_terminal: boolean;
          primary_video_asset_id: string | null;
          poster_asset_id: string | null;
          thumbnail_asset_id: string | null;
          captions_asset_id: string | null;
          duration_seconds: number | null;
          sort_order: number;
          publication_status: PublicationStatus;
          processing_status: ProcessingStatus;
          version: number;
          decision_timing: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          client_id: string;
          experience_id: string;
          pathway_id?: string | null;
          parent_node_id?: string | null;
          node_type?: ContentNodeType;
          internal_name: string;
          title: string;
          chapter_label?: string | null;
          description?: string | null;
          chapter_number?: number | null;
          branch_code?: string | null;
          is_root?: boolean;
          is_terminal?: boolean;
          primary_video_asset_id?: string | null;
          poster_asset_id?: string | null;
          thumbnail_asset_id?: string | null;
          captions_asset_id?: string | null;
          duration_seconds?: number | null;
          sort_order?: number;
          publication_status?: PublicationStatus;
          processing_status?: ProcessingStatus;
          version?: number;
          decision_timing?: Record<string, unknown> | null;
        },
        Partial<{
          pathway_id: string | null;
          parent_node_id: string | null;
          node_type: ContentNodeType;
          internal_name: string;
          title: string;
          chapter_label: string | null;
          description: string | null;
          chapter_number: number | null;
          branch_code: string | null;
          is_root: boolean;
          is_terminal: boolean;
          primary_video_asset_id: string | null;
          poster_asset_id: string | null;
          thumbnail_asset_id: string | null;
          captions_asset_id: string | null;
          duration_seconds: number | null;
          sort_order: number;
          publication_status: PublicationStatus;
          processing_status: ProcessingStatus;
          version: number;
          decision_timing: Record<string, unknown> | null;
        }>
      >;
      choices: TableDef<
        {
          id: string;
          client_id: string;
          source_node_id: string;
          destination_node_id: string | null;
          title: string;
          description: string | null;
          display_order: number;
          thumbnail_asset_id: string | null;
          preview_video_asset_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          client_id: string;
          source_node_id: string;
          destination_node_id?: string | null;
          title: string;
          description?: string | null;
          display_order?: number;
          thumbnail_asset_id?: string | null;
          preview_video_asset_id?: string | null;
          active?: boolean;
        },
        Partial<{
          destination_node_id: string | null;
          title: string;
          description: string | null;
          display_order: number;
          thumbnail_asset_id: string | null;
          preview_video_asset_id: string | null;
          active: boolean;
        }>
      >;
      media_assets: TableDef<
        {
          id: string;
          client_id: string;
          experience_id: string | null;
          media_type: MediaType;
          role: string | null;
          storage_path: string;
          public_url: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          processing_status: ProcessingStatus;
          is_placeholder: boolean;
          version: number;
          checksum: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          client_id: string;
          experience_id?: string | null;
          media_type: MediaType;
          role?: string | null;
          storage_path: string;
          public_url?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          width?: number | null;
          height?: number | null;
          processing_status?: ProcessingStatus;
          is_placeholder?: boolean;
          version?: number;
          checksum?: string | null;
          uploaded_by?: string | null;
        },
        Partial<{
          experience_id: string | null;
          media_type: MediaType;
          role: string | null;
          storage_path: string;
          public_url: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          processing_status: ProcessingStatus;
          is_placeholder: boolean;
          version: number;
          checksum: string | null;
        }>
      >;
      experience_users: TableDef<
        {
          id: string;
          experience_id: string;
          client_id: string;
          auth_user_id: string | null;
          display_name: string | null;
          email: string | null;
          created_at: string;
        },
        {
          id?: string;
          experience_id: string;
          client_id: string;
          auth_user_id?: string | null;
          display_name?: string | null;
          email?: string | null;
        },
        Partial<{ display_name: string | null; email: string | null }>
      >;
      journey_progress: TableDef<
        {
          id: string;
          experience_user_id: string;
          client_id: string;
          pathway_id: string | null;
          current_node_id: string | null;
          player_status: PlayerStatus;
          current_node_elapsed_seconds: number;
          history: unknown[];
          completed_node_ids: string[];
          last_updated_at: string;
        },
        {
          id?: string;
          experience_user_id: string;
          client_id: string;
          pathway_id?: string | null;
          current_node_id?: string | null;
          player_status?: PlayerStatus;
          current_node_elapsed_seconds?: number;
          history?: unknown[];
          completed_node_ids?: string[];
        },
        Partial<{
          pathway_id: string | null;
          current_node_id: string | null;
          player_status: PlayerStatus;
          current_node_elapsed_seconds: number;
          history: unknown[];
          completed_node_ids: string[];
          last_updated_at: string;
        }>
      >;
      engagement_events: TableDef<
        {
          id: string;
          client_id: string;
          experience_id: string;
          experience_user_id: string | null;
          event_type: string;
          event_payload: Record<string, unknown> | null;
          occurred_at: string;
        },
        {
          id?: string;
          client_id: string;
          experience_id: string;
          experience_user_id?: string | null;
          event_type: string;
          event_payload?: Record<string, unknown> | null;
        },
        Record<string, never>
      >;
      brand_settings: TableDef<
        {
          id: string;
          client_id: string;
          logo_asset_id: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          typography: Record<string, unknown> | null;
          terminology_overrides: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          client_id: string;
          logo_asset_id?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          typography?: Record<string, unknown> | null;
          terminology_overrides?: Record<string, unknown> | null;
        },
        Partial<{
          logo_asset_id: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          typography: Record<string, unknown> | null;
          terminology_overrides: Record<string, unknown> | null;
        }>
      >;
      publication_versions: TableDef<
        {
          id: string;
          experience_id: string;
          version_number: number;
          status: PublicationStatus;
          snapshot: Record<string, unknown> | null;
          published_by: string | null;
          published_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          experience_id: string;
          version_number: number;
          status?: PublicationStatus;
          snapshot?: Record<string, unknown> | null;
          published_by?: string | null;
          published_at?: string | null;
        },
        Partial<{
          status: PublicationStatus;
          snapshot: Record<string, unknown> | null;
          published_by: string | null;
          published_at: string | null;
        }>
      >;
    };
  };
}
