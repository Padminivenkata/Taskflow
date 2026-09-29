/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 * Regenerate with:  npx supabase gen types typescript --project-id <ref> --linked
 */
import type { AppRole, SegmentType, SprintStatus, TaskPriority, TaskStatus } from './database'

type Row<T> = { [K in keyof T]: T[K] }
type Insert<T> = { [K in keyof T]?: T[K] }
type Update<T> = { [K in keyof T]?: T[K] }

/** Shape of a row in public.audit_logs, reused by functions that return it. */
export interface AuditRow {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      departments: {
        Row: Row<{
          id: string
          name: string
          code: string | null
          description: string | null
          head_user_id: string | null
          active: boolean
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          name: string
          code?: string | null
          description?: string | null
          head_user_id?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          id?: string
          name?: string
          code?: string | null
          description?: string | null
          head_user_id?: string | null
          active?: boolean
          updated_at?: string
        }>
        Relationships: []
      }
      profiles: {
        Row: Row<{
          id: string
          name: string
          email: string
          role: AppRole
          department_id: string | null
          job_title: string | null
          avatar_url: string | null
          phone: string | null
          daily_working_hours: number
          weekly_working_days: number
          can_create_tasks: boolean
          can_assign_tasks: boolean
          reports_to: string | null
          active: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id: string
          name?: string
          email: string
          role?: AppRole
          department_id?: string | null
          job_title?: string | null
          avatar_url?: string | null
          phone?: string | null
          daily_working_hours?: number
          weekly_working_days?: number
          can_create_tasks?: boolean
          can_assign_tasks?: boolean
          reports_to?: string | null
          active?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          id?: string
          name?: string
          email?: string
          role?: AppRole
          department_id?: string | null
          job_title?: string | null
          avatar_url?: string | null
          phone?: string | null
          daily_working_hours?: number
          weekly_working_days?: number
          can_create_tasks?: boolean
          can_assign_tasks?: boolean
          reports_to?: string | null
          active?: boolean
          last_seen_at?: string | null
          updated_at?: string
        }>
        Relationships: []
      }
      teams: {
        Row: Row<{
          id: string
          name: string
          department_id: string | null
          lead_user_id: string | null
          description: string | null
          active: boolean
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          name: string
          department_id?: string | null
          lead_user_id?: string | null
          description?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          name?: string
          department_id?: string | null
          lead_user_id?: string | null
          description?: string | null
          active?: boolean
          updated_at?: string
        }>
        Relationships: []
      }
      team_members: {
        Row: Row<{ team_id: string; user_id: string; created_at: string }>
        Insert: Insert<{ team_id: string; user_id: string; created_at?: string }>
        Update: Update<{ team_id?: string; user_id?: string }>
        Relationships: []
      }
      sprints: {
        Row: Row<{
          id: string
          name: string
          goal: string | null
          start_date: string | null
          end_date: string | null
          status: SprintStatus
          department_id: string | null
          created_by: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          name: string
          goal?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: SprintStatus
          department_id?: string | null
          created_by?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          name?: string
          goal?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: SprintStatus
          department_id?: string | null
          created_by?: string | null
          completed_at?: string | null
          updated_at?: string
        }>
        Relationships: []
      }
      tasks: {
        Row: Row<{
          id: string
          task_key: string
          seq: number
          title: string
          description: string | null
          department_id: string | null
          assignee_id: string | null
          created_by: string | null
          reporter_id: string | null
          priority: TaskPriority
          status: TaskStatus
          sprint_id: string | null
          due_date: string | null
          planned_hours: number
          actual_hours: number
          blocked_hours: number
          position: number
          story_points: number | null
          blocked_reason: string | null
          started_at: string | null
          completed_at: string | null
          version: number
          created_at: string
          updated_at: string
          updated_by: string | null
        }>
        Insert: Insert<{
          id?: string
          task_key: string
          seq?: number
          title: string
          description?: string | null
          department_id?: string | null
          assignee_id?: string | null
          created_by?: string | null
          reporter_id?: string | null
          priority?: TaskPriority
          status?: TaskStatus
          sprint_id?: string | null
          due_date?: string | null
          planned_hours?: number
          actual_hours?: number
          blocked_hours?: number
          position?: number
          story_points?: number | null
          blocked_reason?: string | null
          started_at?: string | null
          completed_at?: string | null
          version?: number
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }>
        Update: Update<{
          title?: string
          description?: string | null
          department_id?: string | null
          assignee_id?: string | null
          created_by?: string | null
          reporter_id?: string | null
          priority?: TaskPriority
          status?: TaskStatus
          sprint_id?: string | null
          due_date?: string | null
          planned_hours?: number
          actual_hours?: number
          blocked_hours?: number
          position?: number
          story_points?: number | null
          blocked_reason?: string | null
          started_at?: string | null
          completed_at?: string | null
          version?: number
          updated_at?: string
          updated_by?: string | null
        }>
        Relationships: []
      }
      comments: {
        Row: Row<{
          id: string
          task_id: string
          user_id: string
          comment: string
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          task_id: string
          user_id: string
          comment: string
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{ comment?: string; updated_at?: string }>
        Relationships: []
      }
      time_logs: {
        Row: Row<{
          id: string
          task_id: string
          user_id: string
          start_time: string
          end_time: string | null
          duration: number
          segment_type: SegmentType
          source: string
          created_at: string
        }>
        Insert: Insert<{
          id?: string
          task_id: string
          user_id: string
          start_time?: string
          end_time?: string | null
          duration?: number
          segment_type?: SegmentType
          source?: string
          created_at?: string
        }>
        Update: Update<{
          end_time?: string | null
          duration?: number
          segment_type?: SegmentType
          source?: string
        }>
        Relationships: []
      }
      audit_logs: {
        Row: Row<{
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          old_value: Record<string, unknown> | null
          new_value: Record<string, unknown> | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }>
        Insert: never
        Update: never
        Relationships: []
      }
      working_calendar: {
        Row: Row<{
          id: string
          calendar_date: string
          is_working_day: boolean
          label: string | null
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          calendar_date: string
          is_working_day?: boolean
          label?: string | null
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          calendar_date?: string
          is_working_day?: boolean
          label?: string | null
          updated_at?: string
        }>
        Relationships: []
      }
      employee_calendar: {
        Row: Row<{
          id: string
          user_id: string
          calendar_date: string
          is_available: boolean
          hours: number | null
          reason: string | null
          created_at: string
          updated_at: string
        }>
        Insert: Insert<{
          id?: string
          user_id: string
          calendar_date: string
          is_available?: boolean
          hours?: number | null
          reason?: string | null
          created_at?: string
          updated_at?: string
        }>
        Update: Update<{
          is_available?: boolean
          hours?: number | null
          reason?: string | null
          updated_at?: string
        }>
        Relationships: []
      }
      employee_schedules: {
        Row: Row<{ id: string; user_id: string; weekday: number; is_working: boolean; hours: number }>
        Insert: Insert<{ id?: string; user_id: string; weekday: number; is_working?: boolean; hours?: number }>
        Update: Update<{ is_working?: boolean; hours?: number }>
        Relationships: []
      }
      org_settings: {
        Row: Row<{
          id: string
          key: string | null
          value: unknown
          description: string | null
          updated_at: string
        }>
        Insert: Insert<{ id?: string; key?: string | null; value: unknown; description?: string | null; updated_at?: string }>
        Update: Update<{ key?: string | null; value?: unknown; description?: string | null; updated_at?: string }>
        Relationships: []
      }
      pending_invites: {
        Row: Row<{
          id: string
          email: string
          full_name: string | null
          role: AppRole
          department_id: string | null
          invited_by: string | null
          accepted_at: string | null
          created_at: string
        }>
        Insert: Insert<{
          id?: string
          email: string
          full_name?: string | null
          role?: AppRole
          department_id?: string | null
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }>
        Update: Update<{
          email?: string
          full_name?: string | null
          role?: AppRole
          department_id?: string | null
          invited_by?: string | null
          accepted_at?: string | null
        }>
        Relationships: []
      }
    }
    Views: {
      active_time_logs: {
        Row: Row<{
          id: string
          task_id: string
          user_id: string
          start_time: string
          segment_type: SegmentType
          task_key: string
          task_title: string
          elapsed_hours: number
        }>
        Relationships: []
      }
      user_workload: {
        Row: Row<{
          user_id: string
          name: string
          email: string
          department_id: string | null
          daily_working_hours: number
          weekly_working_days: number
          active: boolean
          role: AppRole
          active_tasks: number
          blocked_tasks: number
          overdue_tasks: number
          open_tasks: number
          planned_hours: number
          actual_hours: number
        }>
        Relationships: []
      }
      sprint_progress: {
        Row: Row<{
          sprint_id: string
          sprint_name: string
          sprint_status: SprintStatus
          start_date: string | null
          end_date: string | null
          department_id: string | null
          total_tasks: number
          done_tasks: number
          blocked_tasks: number
          planned_hours: number
          actual_hours: number
        }>
        Relationships: []
      }
    }
    Functions: {
      current_user_id: { Args: Record<PropertyKey, never>; Returns: string }
      current_role: { Args: Record<PropertyKey, never>; Returns: AppRole }
      current_department_id: { Args: Record<PropertyKey, never>; Returns: string }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_department_head: { Args: Record<PropertyKey, never>; Returns: boolean }
      can_view_task: { Args: { p_task: unknown }; Returns: boolean }
      can_edit_task: { Args: { p_task: unknown }; Returns: boolean }
      can_delete_task: { Args: { p_task: unknown }; Returns: boolean }
      create_task: {
        Args: {
          p_title: string
          p_description?: string | null
          p_department_id?: string | null
          p_assignee_id?: string | null
          p_priority?: TaskPriority
          p_status?: TaskStatus
          p_sprint_id?: string | null
          p_due_date?: string | null
          p_planned_hours?: number
          p_story_points?: number | null
          p_position?: number
          p_blocked_reason?: string | null
        }
        Returns: {
          id: string
          task_key: string
          seq: number
          title: string
          description: string | null
          department_id: string | null
          assignee_id: string | null
          created_by: string | null
          reporter_id: string | null
          priority: TaskPriority
          status: TaskStatus
          sprint_id: string | null
          due_date: string | null
          planned_hours: number
          actual_hours: number
          blocked_hours: number
          position: number
          story_points: number | null
          blocked_reason: string | null
          started_at: string | null
          completed_at: string | null
          version: number
          created_at: string
          updated_at: string
          updated_by: string | null
        }[]
      }
      calculate_capacity: {
        Args: { p_user_id: string; p_from: string; p_to: string }
        Returns: {
          user_id: string
          from_date: string
          to_date: string
          working_days: number
          daily_hours: number
          capacity_hours: number
        }[]
      }
      close_open_segments: { Args: { p_task_id: string; p_user_id: string; p_segment?: SegmentType }; Returns: undefined }
      open_segment: { Args: { p_task_id: string; p_user_id: string; p_segment: SegmentType }; Returns: undefined }
      task_activity: { Args: { p_task_id: string }; Returns: AuditRow[] }
      write_audit: {
        Args: {
          p_action: string
          p_entity_type: string
          p_entity_id: string
          p_old_value?: unknown
          p_new_value?: unknown
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: AppRole
      task_status: TaskStatus
      task_priority: TaskPriority
      sprint_status: SprintStatus
      segment_type: SegmentType
    }
    CompositeTypes: Record<PropertyKey, never>
  }
}
