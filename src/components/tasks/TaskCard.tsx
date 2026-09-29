import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarDays, Clock3, MessageSquare, Timer } from 'lucide-react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useData } from '@/context/DataContext'
import { PRIORITY_META, STATUS_META } from '@/lib/constants'
import { avatarColor, formatHours, initials, isOverdue, toISODate } from '@/lib/format'
import type { Task } from '@/types/database'

export function TaskMetaBadges({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { departmentById, sprintById, comments, activeTimeLogs } = useData()
  const department = departmentById(task.department_id)
  const sprint = sprintById(task.sprint_id)
  const commentCount = comments.filter((c) => c.task_id === task.id).length
  const timer = activeTimeLogs.find((t) => t.task_id === task.id)
  const overdue = isOverdue(task.due_date, task.status)
  const today = toISODate(new Date()) ?? ''

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
      {department && (
        <span className="inline-flex max-w-[9rem] items-center gap-1 truncate" title={department.name}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span className="truncate">{department.name}</span>
        </span>
      )}
      {sprint && (
        <span className="inline-flex max-w-[9rem] items-center gap-1 truncate" title={sprint.name}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
          <span className="truncate">{sprint.name}</span>
        </span>
      )}
      {task.due_date && (
        <span
          className={clsx(
            'inline-flex items-center gap-1',
            overdue && 'font-semibold text-rose-400',
          )}
          title={`Due ${task.due_date}`}
        >
          <CalendarDays className="h-3 w-3" style={{ width: 12, height: 12 }} />
          {task.due_date === today ? 'Today' : task.due_date.slice(5)}
        </span>
      )}
      {task.planned_hours > 0 && (
        <span className="inline-flex items-center gap-1" title="Planned hours">
          <Clock3 className="h-3 w-3" style={{ width: 12, height: 12 }} />
          {formatHours(task.planned_hours)}
        </span>
      )}
      {task.actual_hours > 0 && (
        <span className="inline-flex items-center gap-1" title="Logged actual hours">
          {formatHours(task.actual_hours)}
        </span>
      )}
      {commentCount > 0 && (
        <span className="inline-flex items-center gap-1" title={`${commentCount} comments`}>
          <MessageSquare className="h-3 w-3" style={{ width: 12, height: 12 }} />
          {commentCount}
        </span>
      )}
      {!compact && task.status === 'BLOCKED' && (
        <span className="inline-flex items-center gap-1 text-rose-400" title="Blocked">
          <AlertCircle className="h-3 w-3" style={{ width: 12, height: 12 }} />
          {formatHours(task.blocked_hours)} blocked
        </span>
      )}
      {timer && (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-400" title="Timer running">
          <Timer className="h-3 w-3 animate-pulse" style={{ width: 12, height: 12 }} />
          {formatHours(timer.elapsed_hours)}
        </span>
      )}
    </div>
  )
}

export function TaskCard({ task, onOpen }: { task: Task; onOpen?: (task: Task) => void }) {
  const { profileById } = useData()
  const navigate = useNavigate()
  const assignee = profileById(task.assignee_id)
  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]
  const overdue = isOverdue(task.due_date, task.status)

  return (
    <article
      onClick={() => (onOpen ? onOpen(task) : navigate(`/tasks/${task.id}`))}
      className="group cursor-pointer rounded-lg border border-surface-300 bg-surface-100 p-3 transition
                 hover:border-brand-500/50 hover:bg-surface-200 focus:border-brand-500/50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (onOpen) onOpen(task)
          else navigate(`/tasks/${task.id}`)
        }
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-brand-300">{task.task_key}</span>
        <span
          className={clsx('chip shrink-0', priority.chip)}
          title={`${priority.label} priority`}
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full', priority.bar)} />
          {priority.label}
        </span>
      </div>

      <p className="line-clamp-3 text-[13px] font-medium leading-snug text-slate-100">{task.title}</p>

      <div className="mt-2.5">
        <TaskMetaBadges task={task} />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-surface-300 pt-2.5">
        <span
          className={clsx('chip', status.chip, 'md:hidden')}
          title={`Status: ${status.label}`}
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full', status.dot)} />
          {status.short}
        </span>
        <div className="flex items-center gap-1.5">
          {overdue && <AlertCircle className="h-3.5 w-3.5 text-rose-400 md:hidden" />}
          {assignee ? (
            <span
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset ring-white/10',
                avatarColor(assignee.id),
              )}
              title={`Assigned to ${assignee.name}`}
            >
              {initials(assignee.name)}
            </span>
          ) : (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-surface-400 text-[10px] text-slate-500"
              title="Unassigned"
            >
              ?
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export function SortableTaskCard({ task, onOpen }: { task: Task; onOpen?: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('touch-none', isDragging && 'z-50 rotate-1 opacity-80')}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  )
}
