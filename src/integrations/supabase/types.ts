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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      antenna_zones: {
        Row: {
          antenna_port: number | null
          capacity: number
          color: string
          company_slug: string
          created_at: string
          id: string
          label: string | null
          location_id: string | null
          map_id: string
          max_capacity: number
          reader_id: string | null
          shape_data: Json
          shape_kind: string
          updated_at: string
        }
        Insert: {
          antenna_port?: number | null
          capacity?: number
          color?: string
          company_slug: string
          created_at?: string
          id?: string
          label?: string | null
          location_id?: string | null
          map_id: string
          max_capacity?: number
          reader_id?: string | null
          shape_data: Json
          shape_kind: string
          updated_at?: string
        }
        Update: {
          antenna_port?: number | null
          capacity?: number
          color?: string
          company_slug?: string
          created_at?: string
          id?: string
          label?: string | null
          location_id?: string | null
          map_id?: string
          max_capacity?: number
          reader_id?: string | null
          shape_data?: Json
          shape_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "antenna_zones_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "location_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antenna_zones_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "fixed_readers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_slug: string
          created_at: string
          epc_tag_prefix: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_slug: string
          created_at?: string
          epc_tag_prefix?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          company_slug?: string
          created_at?: string
          epc_tag_prefix?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      fixed_readers: {
        Row: {
          antenna_count: number
          company_slug: string
          created_at: string
          hostname: string
          id: string
          is_active: boolean
          model: string | null
          name: string
          updated_at: string
        }
        Insert: {
          antenna_count?: number
          company_slug: string
          created_at?: string
          hostname: string
          id?: string
          is_active?: boolean
          model?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          antenna_count?: number
          company_slug?: string
          created_at?: string
          hostname?: string
          id?: string
          is_active?: boolean
          model?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          category: string | null
          company_prefix: string | null
          company_slug: string | null
          created_at: string
          currency: string | null
          description: string | null
          dimension_unit: string | null
          gtin: string | null
          height: number | null
          id: string
          image_url: string | null
          length: number | null
          name: string
          price: number | null
          sku: string | null
          updated_at: string
          warehouse_location: string | null
          weight: number | null
          weight_unit: string | null
          width: number | null
        }
        Insert: {
          category?: string | null
          company_prefix?: string | null
          company_slug?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          dimension_unit?: string | null
          gtin?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          length?: number | null
          name: string
          price?: number | null
          sku?: string | null
          updated_at?: string
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
          width?: number | null
        }
        Update: {
          category?: string | null
          company_prefix?: string | null
          company_slug?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          dimension_unit?: string | null
          gtin?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          length?: number | null
          name?: string
          price?: number | null
          sku?: string | null
          updated_at?: string
          warehouse_location?: string | null
          weight?: number | null
          weight_unit?: string | null
          width?: number | null
        }
        Relationships: []
      }
      location_maps: {
        Row: {
          company_slug: string
          created_at: string
          id: string
          image_height: number
          image_path: string
          image_width: number
          location_id: string | null
          updated_at: string
        }
        Insert: {
          company_slug: string
          created_at?: string
          id?: string
          image_height?: number
          image_path: string
          image_width?: number
          location_id?: string | null
          updated_at?: string
        }
        Update: {
          company_slug?: string
          created_at?: string
          id?: string
          image_height?: number
          image_path?: string
          image_width?: number
          location_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          barcode: string | null
          company_slug: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          company_slug: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          company_slug?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          company_slug: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          company_slug?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          company_slug?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reader_antennas: {
        Row: {
          antenna_port: number
          company_slug: string
          created_at: string
          description: string | null
          id: string
          location: string
          reader_id: string
        }
        Insert: {
          antenna_port: number
          company_slug: string
          created_at?: string
          description?: string | null
          id?: string
          location: string
          reader_id: string
        }
        Update: {
          antenna_port?: number
          company_slug?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          reader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_antennas_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "fixed_readers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfid_scans: {
        Row: {
          company_slug: string | null
          device_name: string | null
          epc: string
          first_seen: string
          id: string
          last_seen: string
          location: string | null
          notes: string | null
          rssi: number | null
          scan_count: number
          tid: string | null
        }
        Insert: {
          company_slug?: string | null
          device_name?: string | null
          epc: string
          first_seen?: string
          id?: string
          last_seen?: string
          location?: string | null
          notes?: string | null
          rssi?: number | null
          scan_count?: number
          tid?: string | null
        }
        Update: {
          company_slug?: string | null
          device_name?: string | null
          epc?: string
          first_seen?: string
          id?: string
          last_seen?: string
          location?: string | null
          notes?: string | null
          rssi?: number | null
          scan_count?: number
          tid?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tag_items: {
        Row: {
          company_slug: string | null
          created_at: string
          epc: string
          gtin: string | null
          id: string
          item_id: string
        }
        Insert: {
          company_slug?: string | null
          created_at?: string
          epc: string
          gtin?: string | null
          id?: string
          item_id: string
        }
        Update: {
          company_slug?: string | null
          created_at?: string
          epc?: string
          gtin?: string | null
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zebra_reader_debug_logs: {
        Row: {
          company_slug: string | null
          content_length: number | null
          content_type: string | null
          created_at: string
          headers: Json | null
          id: string
          method: string | null
          parse_error: string | null
          parsed_tag_count: number | null
          query_string: string | null
          raw_body: string | null
          reader_hostname: string | null
          remote_ip: string | null
          user_agent: string | null
        }
        Insert: {
          company_slug?: string | null
          content_length?: number | null
          content_type?: string | null
          created_at?: string
          headers?: Json | null
          id?: string
          method?: string | null
          parse_error?: string | null
          parsed_tag_count?: number | null
          query_string?: string | null
          raw_body?: string | null
          reader_hostname?: string | null
          remote_ip?: string | null
          user_agent?: string | null
        }
        Update: {
          company_slug?: string | null
          content_length?: number | null
          content_type?: string | null
          created_at?: string
          headers?: Json | null
          id?: string
          method?: string | null
          parse_error?: string | null
          parsed_tag_count?: number | null
          query_string?: string | null
          raw_body?: string | null
          reader_hostname?: string | null
          remote_ip?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_zebra_debug_logs: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_slug: { Args: { input: string }; Returns: string }
      get_user_company_slug: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin" | "supervisor"
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
      app_role: ["admin", "user", "super_admin", "supervisor"],
    },
  },
} as const
