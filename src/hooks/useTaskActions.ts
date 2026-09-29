import { useCallback } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { useData } from '@/context/DataContext'
import { STATUS_META } from '@/lib/constants'
import type { Task, TaskStatus } from '@/types/database'

/**
 * Single place where task mutations happen, so every caller gets the same
 * optimistic-concurrency guard, audit refresh and error messaging.
 */
export function useTaskActions() {
  const toast = useToast()
  const { refreshTasks, refreshAuditLogs, isEditable } = useData()

  const changeStatus = useCallback(
    async (task: Task, status: TaskStatus, position?: number) => {
      if (!isEditable(task)) {
        toast.error('Permission denied', 'You can only move tasks that are assigned to you or that you created.')
        await refreshTasks()
        return false
      }

      if (task.status === 'BACKLOG' && status !== 'BACKLOG' && !task.sprint_id) {
        // Backlog -> board is allowed; the DB only blocks the reverse.
      }
      if (status === 'BACKLOG' && task.sprint_id) {
        toast.error('Cannot move to Backlog', 'Remove the task from its sprint first.')
        await refreshTasks()
        return false
      }

      const patch: Partial<Task> = { status }
      if (position !== undefined) patch.position = position

      try {
        await api.updateTask(task.id, patch, task.version)
        toast.success(
          `${task.task_key} moved`,
          `${STATUS_META[task.status].label} → ${STATUS_META[status].label}${
            status === 'IN_PROGRESS' ? ' · time tracking started' : ''
          }${status === 'BLOCKED' ? ' · work paused, blocked time recording' : ''}${status === 'DONE' ? ' · tracking stopped' : ''}`,
        )
        await refreshTasks()
        await refreshAuditLogs()
        return true
      } catch (err) {
        toast.error(
          'Could not move the task',
          err instanceof Error ? err.message : 'The board has been refreshed with the latest data.',
        )
        await refreshTasks()
        return false
      }
    },
    [isEditable, refreshTasks, refreshAuditLogs, toast],
  )

  const patchTask = useCallback(
    async (task: Task, patch: Partial<Task>, successMessage = 'Task saved') => {
      try {
        const updated = await api.updateTask(task.id, patch, task.version)
        toast.success(successMessage, `${updated.task_key} updated.`)
        await refreshTasks()
        await refreshAuditLogs()
        return updated
      } catch (err) {
        toast.error('Could not save', err instanceof Error ? err.message : undefined)
        await refreshTasks()
        return null
      }
    },
    [refreshTasks, refreshAuditLogs, toast],
  )

  const deleteTask = useCallback(
    async (task: Task) => {
      try {
        await api.deleteTask(task.id)
        toast.success('Task deleted', `${task.task_key} has been removed.`)
        await refreshTasks()
        await refreshAuditLogs()
        return true
      } catch (err) {
        toast.error('Could not delete', err instanceof Error ? err.message : undefined)
        return false
      }
    },
    [refreshTasks, refreshAuditLogs, toast],
  )

  return { changeStatus, patchTask, deleteTask }
}
