import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { TASK_PRIORITIES, TASK_STATUSES, PRIORITY_META, STATUS_META } from '@/lib/constants'
import type { Task, TaskPriority, TaskStatus } from '@/types/database'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { toISODate } from '@/lib/format'

export interface TaskFormValues {
  title: string
  description: string
  department_id: string
  assignee_id: string
  priority: TaskPriority
  status: TaskStatus
  sprint_id: string
  due_date: string
  planned_hours: string
  story_points: string
  blocked_reason: string
}

const EMPTY: TaskFormValues = {
  title: '',
  description: '',
  department_id: '',
  assignee_id: '',
  priority: 'MEDIUM',
  status: 'TO_DO',
  sprint_id: '',
  due_date: '',
  planned_hours: '0',
  story_points: '',
  blocked_reason: '',
}

export function TaskFormModal({
  open,
  onClose,
  onSaved,
  task,
  defaultStatus,
  defaultSprintId,
}: {
  open: boolean
  onClose: () => void
  onSaved?: (task: Task) => void
  task?: Task | null
  defaultStatus?: TaskStatus
  defaultSprintId?: string | null
}) {
  const toast = useToast()
  const { departments, profiles, sprints, canAssign, canCreate, refreshTasks, refreshAuditLogs, profile } = useData()
  const { user } = useAuth()
  const [values, setValues] = useState<TaskFormValues>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const isEdit = Boolean(task)

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (task) {
      setValues({
        title: task.title,
        description: task.description ?? '',
        department_id: task.department_id ?? '',
        assignee_id: task.assignee_id ?? '',
        priority: task.priority,
        status: task.status,
        sprint_id: task.sprint_id ?? '',
        due_date: toISODate(task.due_date) ?? '',
        planned_hours: String(task.planned_hours ?? 0),
        story_points: task.story_points === null ? '' : String(task.story_points),
        blocked_reason: task.blocked_reason ?? '',
      })
    } else {
      setValues({
        ...EMPTY,
        status: defaultStatus && defaultStatus !== 'BACKLOG' ? defaultStatus : 'TO_DO',
        department_id: profile?.department_id ?? '',
        sprint_id: defaultSprintId ?? '',
      })
    }
  }, [open, task, defaultStatus, defaultSprintId, profile?.department_id])

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const activeSprints = useMemo(() => sprints.filter((s) => s.status !== 'COMPLETED'), [sprints])
  const assignable = useMemo(
    () => profiles.filter((p) => p.active),
    [profiles],
  )

  const validate = () => {
    const next: Record<string, string> = {}
    const title = values.title.trim()
    if (title.length < 3) next.title = 'Title must be at least 3 characters'
    else if (title.length > 300) next.title = 'Title must be under 300 characters'

    const hours = Number(values.planned_hours)
    if (values.planned_hours.trim() === '' || Number.isNaN(hours) || hours < 0)
      next.planned_hours = 'Enter a number of hours (0 or more)'
    else if (hours > 999) next.planned_hours = 'That is too many hours'

    if (values.status === 'BLOCKED' && !values.blocked_reason.trim())
      next.blocked_reason = 'Tell the team why this task is blocked'

    if (values.due_date && Number.isNaN(Date.parse(values.due_date))) next.due_date = 'Invalid date'

    if (values.status !== 'BACKLOG' && !values.sprint_id && values.status === 'TO_DO') {
      // leaving sprint blank is allowed: the task simply lives outside a sprint
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (!user) return

    setBusy(true)
    try {
      const planned_hours = Number(values.planned_hours)
      const story_points = values.story_points.trim() === '' ? null : Number(values.story_points)
      const common = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        department_id: values.department_id || null,
        assignee_id: values.assignee_id || null,
        priority: values.priority,
        sprint_id: values.status === 'BACKLOG' ? null : values.sprint_id || null,
        due_date: values.due_date || null,
        planned_hours,
        story_points: story_points !== null && !Number.isNaN(story_points) ? story_points : null,
        blocked_reason: values.status === 'BLOCKED' ? values.blocked_reason.trim() || null : null,
      }

      if (task) {
        const updated = await api.updateTask(task.id, { ...common, status: values.status }, task.version)
        toast.success('Task updated', `${updated.task_key} saved.`)
        onSaved?.(updated)
      } else {
        const created = await api.createTask({ ...common, status: values.status })
        toast.success('Task created', `${created.task_key} added to the board.`)
        onSaved?.(created)
      }
      await refreshTasks()
      await refreshAuditLogs()
      onClose()
    } catch (err) {
      toast.error(
        isEdit ? 'Could not save the task' : 'Could not create the task',
        err instanceof Error ? err.message : undefined,
      )
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  if (!canCreate && !isEdit) {
    return (
      <Modal open={open} onClose={onClose} title="Create task" size="sm">
        <p className="text-sm text-slate-400">
          Your role does not allow task creation. Ask a System Admin or your Department Head to enable it.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${task?.task_key}` : 'Create a new task'}
      description={
        isEdit
          ? 'The task ID stays permanently attached to this task.'
          : 'A permanent task ID is reserved automatically when you save.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Title" required error={errors.title}>
          <Input
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Implement login screen for the client portal"
            maxLength={300}
            invalid={Boolean(errors.title)}
            autoFocus
          />
        </Field>

        <Field label="Description" hint="Markdown is supported. Plain text also works.">
          <Textarea
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What needs to be done, and what does done look like?"
            rows={5}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" required>
            <Select value={values.department_id} onChange={(e) => set('department_id', e.target.value)}>
              <option value="">No department</option>
              {departments
                .filter((d) => d.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field
            label="Assignee"
            required={canAssign}
            hint={canAssign ? undefined : 'Only leads and admins can assign work.'}
          >
            <Select
              value={values.assignee_id}
              onChange={(e) => set('assignee_id', e.target.value)}
              disabled={!canAssign && !task?.assignee_id}
            >
              <option value="">Unassigned</option>
              {assignable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.job_title || p.role.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Priority" required>
            <Select value={values.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" required>
            <Select value={values.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Sprint"
            hint={values.status === 'BACKLOG' ? 'Backlog tasks cannot belong to a sprint.' : undefined}
          >
            <Select
              value={values.sprint_id}
              onChange={(e) => set('sprint_id', e.target.value)}
              disabled={values.status === 'BACKLOG'}
            >
              <option value="">Not in a sprint</option>
              {activeSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due date" error={errors.due_date}>
            <Input
              type="date"
              value={values.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              invalid={Boolean(errors.due_date)}
            />
          </Field>

          <Field label="Planned hours" required error={errors.planned_hours} hint="Estimate before you start.">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={values.planned_hours}
              onChange={(e) => set('planned_hours', e.target.value)}
              invalid={Boolean(errors.planned_hours)}
            />
          </Field>

          <Field label="Story points" hint="Optional.">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={values.story_points}
              onChange={(e) => set('story_points', e.target.value)}
              placeholder="e.g. 3"
            />
          </Field>
        </div>

        {values.status === 'BLOCKED' && (
          <Field label="Why is it blocked?" required error={errors.blocked_reason}>
            <Input
              value={values.blocked_reason}
              onChange={(e) => set('blocked_reason', e.target.value)}
              placeholder="Waiting on API credentials from the client"
              invalid={Boolean(errors.blocked_reason)}
            />
          </Field>
        )}
      </form>
    </Modal>
  )
}
