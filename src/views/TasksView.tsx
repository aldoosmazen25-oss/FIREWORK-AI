import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Columns3, List, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { validateTaskInput } from '../utils/domain';
import type { TaskRecord } from '../types/app';
import { GoogleSignInButton } from '../components/BrandIcons';

const STATUS_COLUMNS: Array<{ id: TaskRecord['status']; label: string }> = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'completed', label: 'Completed' },
];

export function TasksView({ initialMode = 'list' }: { initialMode?: 'list' | 'kanban' | 'calendar' }) {
  const { firebaseUser, t, handleGoogleSignIn, pushToast, refreshTrigger, triggerDataRefresh } =
    useApp();

  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>(initialMode);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setViewMode(initialMode);
  }, [initialMode]);

  const loadTasks = useCallback(async () => {
    if (!firebaseUser) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ tasks: TaskRecord[] }>('/api/tasks');
      setTasks(res.tasks ?? []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load tasks.', 'error');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, pushToast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshTrigger]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !task.title.toLowerCase().includes(q) &&
          !(task.description ?? '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, statusFilter, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateTaskInput({ title, priority, dueDate: dueDate || null });
    setFormErrors(check.errors);
    if (!check.valid) return;

    setSaving(true);
    try {
      await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          dueDate: dueDate || null,
          status: 'todo',
        }),
      });
      setModalOpen(false);
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('medium');
      triggerDataRefresh();
      pushToast('Task saved to database.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to create task.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (taskId: number, status: TaskRecord['status']) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTasks((prev) => prev.map((tk) => (tk.id === taskId ? { ...tk, status } : tk)));
      triggerDataRefresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update task.', 'error');
    }
  };

  const handleDelete = async (taskId: number) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((tk) => tk.id !== taskId));
      triggerDataRefresh();
      pushToast('Task deleted.', 'neutral');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to delete task.', 'error');
    }
  };

  // Calendar Grid for current month
  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstDay; i += 1) cells.push({ iso: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, dayNum: d });
    }
    return {
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      cells,
    };
  }, []);

  if (!firebaseUser) {
    return (
      <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-10 text-center space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {viewMode === 'calendar' ? t.nav.calendar : t.tasks.title}
        </h2>
        <p className="text-xs text-[#777987] max-w-md mx-auto">{t.dashboard.signInPrompt}</p>
        <GoogleSignInButton onClick={handleGoogleSignIn} label={t.actions.signIn} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/6 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                  : 'text-[#777987]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>{t.tasks.list}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                  : 'text-[#777987]'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span>{t.tasks.kanban}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
                viewMode === 'calendar'
                  ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                  : 'text-[#777987]'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{t.tasks.calendar}</span>
            </button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tasks..."
            aria-label="Filter tasks"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-1.5 text-xs focus:border-[#7657E8] focus:outline-none"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter tasks by status"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-1.5 text-xs"
          >
            <option value="all">All Statuses</option>
            {STATUS_COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6] whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t.actions.newTask}</span>
        </button>
      </div>

      {/* Views */}
      {loading ? (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-6">
          <div className="h-12 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
        </div>
      ) : viewMode === 'list' ? (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">{t.tasks.emptyTitle}</p>
              <p className="mt-1 text-xs text-[#777987]">{t.tasks.emptyDesc}</p>
            </div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-black/6 dark:border-white/6 text-[#777987]">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">Task</th>
                  <th className="px-4 py-3 text-start font-medium">Priority</th>
                  <th className="px-4 py-3 text-start font-medium">Due Date</th>
                  <th className="px-4 py-3 text-start font-medium">Status</th>
                  <th className="px-4 py-3 text-end font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/6 dark:divide-white/6">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-[#F9FAFC] dark:hover:bg-white/3">
                    <td className="px-5 py-3">
                      <p className="font-medium text-[#171820] dark:text-[#F2F3F7]">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 text-[#777987] truncate max-w-md">{task.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          task.priority === 'high'
                            ? 'text-[#E36C76] font-medium'
                            : task.priority === 'medium'
                              ? 'text-[#E6AE53]'
                              : 'text-[#777987]'
                        }
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[#777987]">
                      {task.dueDate || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          handleStatusChange(task.id, e.target.value as TaskRecord['status'])
                        }
                        aria-label={`Change status for ${task.title}`}
                        className="rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-2 py-1 text-xs"
                      >
                        {STATUS_COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => handleDelete(task.id)}
                        aria-label={`Delete task ${task.title}`}
                        className="rounded-lg p-1.5 text-[#777987] hover:text-[#E36C76]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((tk) => tk.status === col.id);
            return (
              <div
                key={col.id}
                className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] flex flex-col"
              >
                <div className="flex items-center justify-between border-b border-black/6 dark:border-white/6 px-4 py-3">
                  <span className="text-xs font-semibold">{col.label}</span>
                  <span className="font-mono text-xs tabular-nums text-[#777987]">
                    {colTasks.length}
                  </span>
                </div>
                <div className="p-3 space-y-2.5 flex-1">
                  {colTasks.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#777987]">No tasks</p>
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl border border-black/8 dark:border-white/8 bg-[#F9FAFC] dark:bg-[#14161D] p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium">{task.title}</p>
                          <button
                            type="button"
                            onClick={() => handleDelete(task.id)}
                            aria-label={`Delete ${task.title}`}
                            className="text-[#777987] hover:text-[#E36C76]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#777987]">
                          <span className="capitalize">{task.priority}</span>
                          <span className="font-mono tabular-nums">{task.dueDate || 'No date'}</span>
                        </div>
                        <select
                          value={task.status}
                          onChange={(e) =>
                            handleStatusChange(task.id, e.target.value as TaskRecord['status'])
                          }
                          aria-label={`Move ${task.title}`}
                          className="w-full rounded-lg border border-black/8 dark:border-white/10 bg-white dark:bg-[#101116] px-2 py-1 text-[11px]"
                        >
                          {STATUS_COLUMNS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              Move to {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">{calendarDays.monthLabel}</h3>
            <span className="text-xs text-[#777987]">
              Showing tasks with assigned due dates
            </span>
          </div>
          <div className="grid grid-cols-7 gap-px bg-black/8 dark:bg-white/8 border border-black/8 dark:border-white/8 rounded-xl overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="bg-[#F9FAFC] dark:bg-[#14161D] px-2.5 py-2 text-[11px] font-medium text-[#777987]"
              >
                {day}
              </div>
            ))}
            {calendarDays.cells.map((cell, idx) => {
              const dayTasks = cell.iso
                ? filteredTasks.filter((tk) => tk.dueDate === cell.iso)
                : [];
              return (
                <div
                  key={idx}
                  className="min-h-[86px] bg-white dark:bg-[#1A1C24] p-2 text-xs"
                >
                  {cell.dayNum && (
                    <>
                      <span className="font-mono text-[11px] text-[#777987]">{cell.dayNum}</span>
                      <div className="mt-1 space-y-1">
                        {dayTasks.map((tk) => (
                          <div
                            key={tk.id}
                            className="truncate rounded bg-[#7657E8]/12 px-1.5 py-0.5 text-[11px] text-[#7657E8]"
                            title={tk.title}
                          >
                            {tk.title}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-task-title"
        >
          <div className="glass-popover w-full max-w-md rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-black/8 dark:border-white/8">
              <h3 id="new-task-title" className="text-base font-semibold">
                {t.actions.newTask}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close new task modal"
                className="rounded-lg p-1.5 text-[#777987]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="task-title" className="block text-xs text-[#777987] mb-1">
                  Title
                </label>
                <input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Prepare client milestone handoff"
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
                {formErrors.title && (
                  <p className="mt-1 text-xs text-[#E36C76]">{formErrors.title}</p>
                )}
              </div>

              <div>
                <label htmlFor="task-desc" className="block text-xs text-[#777987] mb-1">
                  Description
                </label>
                <textarea
                  id="task-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="task-priority" className="block text-xs text-[#777987] mb-1">
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="task-due" className="block text-xs text-[#777987] mb-1">
                    Due Date
                  </label>
                  <input
                    id="task-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-black/10 dark:border-white/12 px-4 py-2 text-xs font-medium"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
