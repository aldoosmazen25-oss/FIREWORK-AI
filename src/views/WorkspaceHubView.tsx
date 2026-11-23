import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckSquare,
  ClipboardList,
  ExternalLink,
  FileText,
  Mail,
  Pin,
  Plus,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import {
  createGoogleDoc,
  createGoogleForm,
  createGoogleMeetSpace,
  createGoogleTask,
  deleteGoogleTask,
  getGoogleFormResponses,
  listGoogleTasks,
  listRecentEmails,
  readGoogleDoc,
  sendGmailMessage,
  type GmailSummary,
  type GoogleTaskItem,
} from '../lib/workspace-api';
import type { WorkspaceNoteRecord } from '../types/app';
import { GoogleSignInButton } from '../components/BrandIcons';
import { ConfirmDialog } from '../components/ConfirmDialog';

type HubTab = 'gmail' | 'docs' | 'tasks' | 'forms' | 'meet' | 'notes';

interface ConfirmState {
  title: string;
  description: string;
  destructive?: boolean;
  confirmLabel?: string;
  action: () => Promise<void>;
}

export function WorkspaceHubView() {
  const {
    firebaseUser,
    hasWorkspaceToken,
    handleGoogleSignIn,
    setAuthModalOpen,
    pushToast,
    t,
  } = useApp();

  const [activeTab, setActiveTab] = useState<HubTab>('gmail');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Gmail state
  const [emails, setEmails] = useState<GmailSummary[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  // Docs state
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [createdDocs, setCreatedDocs] = useState<Array<{ documentId: string; title: string; url: string }>>([]);
  const [readDocId, setReadDocId] = useState('');
  const [readDocResult, setReadDocResult] = useState<{ title: string; text: string; url: string } | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Google Tasks state
  const [gTasks, setGTasks] = useState<GoogleTaskItem[]>([]);
  const [loadingGTasks, setLoadingGTasks] = useState(false);
  const [newGTaskTitle, setNewGTaskTitle] = useState('');
  const [newGTaskNotes, setNewGTaskNotes] = useState('');
  const [newGTaskDue, setNewGTaskDue] = useState('');

  // Google Forms state
  const [formTitle, setFormTitle] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [createdForms, setCreatedForms] = useState<Array<{ formId: string; title: string; responderUri: string }>>([]);
  const [lookupFormId, setLookupFormId] = useState('');
  const [formResponses, setFormResponses] = useState<Array<{ responseId: string; createTime?: string }>>([]);
  const [loadingFormResp, setLoadingFormResp] = useState(false);

  // Google Meet state
  const [meetSpaces, setMeetSpaces] = useState<Array<{ name: string; meetingUri: string; meetingCode: string }>>([]);
  const [creatingMeet, setCreatingMeet] = useState(false);

  // Persistent Workspace Notes (PostgreSQL)
  const [notes, setNotes] = useState<WorkspaceNoteRecord[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const runConfirmedAction = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Workspace operation failed.', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const fetchEmails = useCallback(async () => {
    if (!hasWorkspaceToken) return;
    setLoadingEmails(true);
    try {
      const list = await listRecentEmails(12);
      setEmails(list);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to read Gmail inbox.', 'error');
    } finally {
      setLoadingEmails(false);
    }
  }, [hasWorkspaceToken, pushToast]);

  const fetchGTasks = useCallback(async () => {
    if (!hasWorkspaceToken) return;
    setLoadingGTasks(true);
    try {
      const list = await listGoogleTasks();
      setGTasks(list);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to load Google Tasks.', 'error');
    } finally {
      setLoadingGTasks(false);
    }
  }, [hasWorkspaceToken, pushToast]);

  const fetchNotes = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingNotes(true);
    try {
      const res = await apiRequest<{ notes: WorkspaceNoteRecord[] }>('/api/notes');
      setNotes(res.notes ?? []);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to load workspace notes.', 'error');
    } finally {
      setLoadingNotes(false);
    }
  }, [firebaseUser, pushToast]);

  useEffect(() => {
    if (activeTab === 'gmail' && hasWorkspaceToken) fetchEmails();
    if (activeTab === 'tasks' && hasWorkspaceToken) fetchGTasks();
    if (activeTab === 'notes' && firebaseUser) fetchNotes();
  }, [activeTab, hasWorkspaceToken, firebaseUser, fetchEmails, fetchGTasks, fetchNotes]);

  const tabs: Array<{ id: HubTab; label: string; icon: React.ReactNode }> = [
    { id: 'gmail', label: t.workspaceHub.gmail, icon: <Mail className="h-4 w-4" /> },
    { id: 'docs', label: t.workspaceHub.docs, icon: <FileText className="h-4 w-4" /> },
    { id: 'tasks', label: t.workspaceHub.gtasks, icon: <CheckSquare className="h-4 w-4" /> },
    { id: 'forms', label: t.workspaceHub.forms, icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'meet', label: t.workspaceHub.meet, icon: <Video className="h-4 w-4" /> },
    { id: 'notes', label: t.workspaceHub.notes, icon: <StickyNote className="h-4 w-4" /> },
  ];

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await apiRequest<{ note: WorkspaceNoteRecord }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: noteTitle.trim(), content: noteContent.trim() }),
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteTitle('');
      setNoteContent('');
      pushToast('Note saved to your workspace database.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to save note.', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const togglePinNote = async (note: WorkspaceNoteRecord) => {
    try {
      const res = await apiRequest<{ note: WorkspaceNoteRecord }>(`/api/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      setNotes((prev) =>
        prev
          .map((n) => (n.id === note.id ? res.note : n))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      );
    } catch {
      pushToast('Unable to update note.', 'error');
    }
  };

  const handleDeleteNote = (note: WorkspaceNoteRecord) => {
    setConfirmState({
      title: 'Delete Workspace Note',
      description: `Permanently delete "${note.title}" from your workspace database?`,
      destructive: true,
      confirmLabel: t.actions.delete,
      action: async () => {
        await apiRequest(`/api/notes/${note.id}`, { method: 'DELETE' });
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        pushToast('Note deleted.', 'neutral');
      },
    });
  };

  const renderWorkspaceAuthGate = () => (
    <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-8">
      <div className="max-w-lg">
        <h3 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
          {t.actions.connectWorkspace}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
          {t.workspaceHub.authNeeded} Access tokens remain strictly in browser memory for your current session and are never written to browser storage.
        </p>
        <div className="mt-5 max-w-xs">
          <GoogleSignInButton onClick={handleGoogleSignIn} label={t.actions.signIn} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#171820] dark:text-[#F2F3F7]">
            {t.workspaceHub.title}
          </h1>
          <p className="mt-1 text-sm text-[#777987] dark:text-[#9B9EAC]">
            {t.workspaceHub.subtitle}
          </p>
        </div>
        {!hasWorkspaceToken && activeTab === 'notes' && (
          <div className="w-full sm:w-auto">
            <GoogleSignInButton onClick={handleGoogleSignIn} label={t.actions.connectWorkspace} />
          </div>
        )}
      </header>

      {/* Segmented Navigation Bar */}
      <nav
        aria-label="Google Workspace Services"
        className="flex items-center gap-1 overflow-x-auto border-b border-black/[0.07] dark:border-white/[0.08] pb-2"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#7657E8] text-white'
                  : 'text-[#777987] dark:text-[#9B9EAC] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#171820] dark:hover:text-[#F2F3F7]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* TAB 1: GMAIL */}
      {activeTab === 'gmail' &&
        (!hasWorkspaceToken ? (
          renderWorkspaceAuthGate()
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
                <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  Recent Inbox Messages
                </h2>
                <button
                  type="button"
                  onClick={fetchEmails}
                  disabled={loadingEmails}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingEmails ? 'animate-spin' : ''}`} />
                  <span>{t.actions.refresh}</span>
                </button>
              </div>
              <div className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {loadingEmails && emails.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#777987]">Loading Gmail messages...</p>
                ) : emails.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#777987]">No recent messages found.</p>
                ) : (
                  emails.map((email) => (
                    <article key={email.id} className="py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                          {email.subject}
                        </h3>
                        <span className="shrink-0 font-mono text-[11px] text-[#777987]">
                          {email.date.slice(0, 16)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#777987]">{email.from}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
                        {email.snippet}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Compose Email
              </h2>
              <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                Emails are sent directly from your authorized Gmail account after confirmation.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!mailTo.trim() || !mailSubject.trim() || !mailBody.trim()) return;
                  setConfirmState({
                    title: 'Confirm Email Delivery',
                    description: `Send email "${mailSubject.trim()}" to ${mailTo.trim()} via Gmail?`,
                    confirmLabel: 'Send Email',
                    action: async () => {
                      await sendGmailMessage(mailTo.trim(), mailSubject.trim(), mailBody.trim());
                      setMailTo('');
                      setMailSubject('');
                      setMailBody('');
                      pushToast('Email sent via Gmail.', 'success');
                      await fetchEmails();
                    },
                  });
                }}
                className="mt-4 space-y-3"
              >
                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    required
                    value={mailTo}
                    onChange={(e) => setMailTo(e.target.value)}
                    placeholder="client@company.com"
                    className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Subject
                  </label>
                  <input
                    type="text"
                    required
                    value={mailSubject}
                    onChange={(e) => setMailSubject(e.target.value)}
                    placeholder="Project deliverable update"
                    className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Message
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={mailBody}
                    onChange={(e) => setMailBody(e.target.value)}
                    placeholder="Write your update..."
                    className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Review & Send</span>
                </button>
              </form>
            </section>
          </div>
        ))}

      {/* TAB 2: GOOGLE DOCS */}
      {activeTab === 'docs' &&
        (!hasWorkspaceToken ? (
          renderWorkspaceAuthGate()
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Create Google Document
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!docTitle.trim()) return;
                  setConfirmState({
                    title: 'Create Google Doc',
                    description: `Create a new Google Doc titled "${docTitle.trim()}" in your Google Drive?`,
                    confirmLabel: 'Create Document',
                    action: async () => {
                      const doc = await createGoogleDoc(docTitle.trim(), docContent);
                      setCreatedDocs((prev) => [doc, ...prev]);
                      setDocTitle('');
                      setDocContent('');
                      pushToast(`Created "${doc.title}" in Google Docs.`, 'success');
                    },
                  });
                }}
                className="mt-4 space-y-3"
              >
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Document title (e.g. Q3 Project Scope)"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <textarea
                  rows={5}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Initial document outline or proposal text..."
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Google Doc</span>
                </button>
              </form>

              {createdDocs.length > 0 && (
                <div className="mt-5 border-t border-black/[0.06] dark:border-white/[0.08] pt-4 space-y-2">
                  <p className="text-xs font-medium text-[#777987]">Created This Session</p>
                  {createdDocs.map((d) => (
                    <div
                      key={d.documentId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-xs"
                    >
                      <span className="truncate font-medium text-[#171820] dark:text-[#F2F3F7]">
                        {d.title}
                      </span>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[#7657E8] hover:underline"
                      >
                        <span>Open</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Inspect Document by ID
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!readDocId.trim()) return;
                  setLoadingDoc(true);
                  try {
                    const data = await readGoogleDoc(readDocId.trim());
                    setReadDocResult(data);
                  } catch (error) {
                    pushToast(error instanceof Error ? error.message : 'Unable to read document.', 'error');
                  } finally {
                    setLoadingDoc(false);
                  }
                }}
                className="mt-4 flex gap-2"
              >
                <input
                  type="text"
                  value={readDocId}
                  onChange={(e) => setReadDocId(e.target.value)}
                  placeholder="Paste Google Document ID..."
                  className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loadingDoc}
                  className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {loadingDoc ? '...' : 'Read'}
                </button>
              </form>
              {readDocResult && (
                <div className="mt-4 rounded-xl bg-[#F5F6F8] dark:bg-[#101116] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                      {readDocResult.title}
                    </h3>
                    <a
                      href={readDocResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#7657E8] hover:underline"
                    >
                      <span>Open in Docs</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
                    {readDocResult.text || '(Empty document)'}
                  </p>
                </div>
              )}
            </section>
          </div>
        ))}

      {/* TAB 3: GOOGLE TASKS */}
      {activeTab === 'tasks' &&
        (!hasWorkspaceToken ? (
          renderWorkspaceAuthGate()
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
                <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  Google Tasks (@default)
                </h2>
                <button
                  type="button"
                  onClick={fetchGTasks}
                  disabled={loadingGTasks}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingGTasks ? 'animate-spin' : ''}`} />
                  <span>{t.actions.refresh}</span>
                </button>
              </div>
              <div className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {gTasks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#777987]">
                    No Google Tasks returned for your default list.
                  </p>
                ) : (
                  gTasks.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            item.status === 'completed'
                              ? 'line-through text-[#777987]'
                              : 'text-[#171820] dark:text-[#F2F3F7]'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#777987] dark:text-[#9B9EAC]">
                          {item.status === 'completed' ? 'Completed' : 'Open'}
                          {item.due ? ` · Due ${item.due.slice(0, 10)}` : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: 'Delete Google Task',
                            description: `Remove "${item.title}" from your Google Tasks list?`,
                            destructive: true,
                            confirmLabel: t.actions.delete,
                            action: async () => {
                              await deleteGoogleTask(item.id);
                              setGTasks((prev) => prev.filter((gt) => gt.id !== item.id));
                              pushToast('Google Task deleted.', 'neutral');
                            },
                          })
                        }
                        aria-label={`Delete ${item.title}`}
                        className="rounded-lg p-1.5 text-[#777987] hover:bg-[#E36C76]/10 hover:text-[#E36C76]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Add to Google Tasks
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newGTaskTitle.trim()) return;
                  setConfirmState({
                    title: 'Create Google Task',
                    description: `Add "${newGTaskTitle.trim()}" to your Google Tasks default list?`,
                    confirmLabel: 'Create Task',
                    action: async () => {
                      const created = await createGoogleTask(
                        newGTaskTitle.trim(),
                        newGTaskNotes,
                        newGTaskDue,
                      );
                      setGTasks((prev) => [created, ...prev]);
                      setNewGTaskTitle('');
                      setNewGTaskNotes('');
                      setNewGTaskDue('');
                      pushToast('Added to Google Tasks.', 'success');
                    },
                  });
                }}
                className="mt-4 space-y-3"
              >
                <input
                  type="text"
                  required
                  value={newGTaskTitle}
                  onChange={(e) => setNewGTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <input
                  type="date"
                  value={newGTaskDue}
                  onChange={(e) => setNewGTaskDue(e.target.value)}
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <textarea
                  rows={3}
                  value={newGTaskNotes}
                  onChange={(e) => setNewGTaskNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Google Task</span>
                </button>
              </form>
            </section>
          </div>
        ))}

      {/* TAB 4: GOOGLE FORMS */}
      {activeTab === 'forms' &&
        (!hasWorkspaceToken ? (
          renderWorkspaceAuthGate()
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Create Client Intake Form
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formTitle.trim()) return;
                  setConfirmState({
                    title: 'Create Google Form',
                    description: `Create a new Google Form titled "${formTitle.trim()}" in your account?`,
                    confirmLabel: 'Create Form',
                    action: async () => {
                      const created = await createGoogleForm(formTitle.trim(), formPrompt);
                      setCreatedForms((prev) => [created, ...prev]);
                      setFormTitle('');
                      setFormPrompt('');
                      pushToast('Google Form created.', 'success');
                    },
                  });
                }}
                className="mt-4 space-y-3"
              >
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Form title (e.g. Client Discovery Questionnaire)"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <input
                  type="text"
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder="First question (e.g. Describe your project goals & timeline)"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Google Form</span>
                </button>
              </form>

              {createdForms.length > 0 && (
                <div className="mt-5 border-t border-black/[0.06] dark:border-white/[0.08] pt-4 space-y-2">
                  {createdForms.map((f) => (
                    <div
                      key={f.formId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-xs"
                    >
                      <span className="truncate font-medium text-[#171820] dark:text-[#F2F3F7]">
                        {f.title} · <span className="font-mono text-[#777987]">{f.formId}</span>
                      </span>
                      <a
                        href={f.responderUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[#7657E8] hover:underline"
                      >
                        <span>Open</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
              <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                Check Form Responses
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!lookupFormId.trim()) return;
                  setLoadingFormResp(true);
                  try {
                    const data = await getGoogleFormResponses(lookupFormId.trim());
                    setFormResponses(data.responses ?? []);
                  } catch (error) {
                    pushToast(error instanceof Error ? error.message : 'Unable to fetch responses.', 'error');
                  } finally {
                    setLoadingFormResp(false);
                  }
                }}
                className="mt-4 flex gap-2"
              >
                <input
                  type="text"
                  value={lookupFormId}
                  onChange={(e) => setLookupFormId(e.target.value)}
                  placeholder="Enter Form ID"
                  className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loadingFormResp}
                  className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {loadingFormResp ? '...' : 'Fetch'}
                </button>
              </form>
              <div className="mt-4 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {formResponses.length === 0 ? (
                  <p className="py-6 text-xs text-[#777987]">
                    Responses for the queried form will be listed here.
                  </p>
                ) : (
                  formResponses.map((r) => (
                    <div key={r.responseId} className="py-2.5 text-xs">
                      <span className="font-mono text-[#171820] dark:text-[#F2F3F7]">{r.responseId}</span>
                      {r.createTime && (
                        <span className="ms-2 text-[#777987]">{new Date(r.createTime).toLocaleString()}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ))}

      {/* TAB 5: GOOGLE MEET */}
      {activeTab === 'meet' &&
        (!hasWorkspaceToken ? (
          renderWorkspaceAuthGate()
        ) : (
          <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  Instant Google Meet Spaces
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Provision a live meeting link for client kickoffs, design reviews, or milestone handoffs.
                </p>
              </div>
              <button
                type="button"
                disabled={creatingMeet}
                onClick={async () => {
                  setCreatingMeet(true);
                  try {
                    const space = await createGoogleMeetSpace();
                    setMeetSpaces((prev) => [space, ...prev]);
                    pushToast('Google Meet space created.', 'success');
                  } catch (error) {
                    pushToast(error instanceof Error ? error.message : 'Unable to create Meet space.', 'error');
                  } finally {
                    setCreatingMeet(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Video className="h-4 w-4" />
                <span>{creatingMeet ? 'Creating...' : 'Create Meet Link'}</span>
              </button>
            </div>

            {meetSpaces.length > 0 && (
              <div className="mt-5 divide-y divide-black/[0.05] dark:divide-white/[0.06] border-t border-black/[0.06] dark:border-white/[0.08]">
                {meetSpaces.map((m) => (
                  <div key={m.meetingCode} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div>
                      <p className="font-mono text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                        {m.meetingCode}
                      </p>
                      <p className="text-xs text-[#777987]">{m.meetingUri}</p>
                    </div>
                    <a
                      href={m.meetingUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-[#7657E8] hover:bg-[#7657E8]/10"
                    >
                      <span>Join Meeting</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

      {/* TAB 6: WORKSPACE NOTES (PostgreSQL persistent companion + honest Keep notice) */}
      {activeTab === 'notes' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-[#F5F6F8] dark:bg-[#101116] px-4 py-3 text-xs leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
            {t.workspaceHub.keepNotice}
          </div>

          {!firebaseUser ? (
            <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-8 text-center">
              <p className="text-sm text-[#777987] dark:text-[#9B9EAC]">
                Sign in to save persistent Workspace Notes to your PostgreSQL account.
              </p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="mt-4 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6]"
              >
                Sign In
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
              <form
                onSubmit={handleSaveNote}
                className="h-fit rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5 space-y-3"
              >
                <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  New Workspace Note
                </h2>
                <input
                  type="text"
                  required
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <textarea
                  required
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Capture meeting takeaways, client notes, or milestone checklists..."
                  className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingNote}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>{savingNote ? 'Saving...' : t.actions.save}</span>
                </button>
              </form>

              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
                <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  Saved Notes ({notes.length})
                </h2>
                <div className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {loadingNotes && notes.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[#777987]">Loading notes...</p>
                  ) : notes.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[#777987]">
                      No saved notes yet. Create your first workspace note on the left.
                    </p>
                  ) : (
                    notes.map((note) => (
                      <article key={note.id} className="flex items-start justify-between gap-4 py-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                              {note.title}
                            </h3>
                            {note.pinned && (
                              <span className="text-[11px] font-medium text-[#7657E8]">Pinned</span>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
                            {note.content}
                          </p>
                          <p className="mt-1.5 font-mono text-[11px] text-[#777987]">
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => togglePinNote(note)}
                            aria-label="Toggle pin"
                            className={`rounded-lg p-1.5 transition-colors ${
                              note.pinned
                                ? 'text-[#7657E8] bg-[#7657E8]/10'
                                : 'text-[#777987] hover:bg-black/5 dark:hover:bg-white/10'
                            }`}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note)}
                            aria-label="Delete note"
                            className="rounded-lg p-1.5 text-[#777987] hover:bg-[#E36C76]/10 hover:text-[#E36C76]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ''}
        description={confirmState?.description || ''}
        confirmLabel={confirmState?.confirmLabel || t.actions.confirm}
        cancelLabel={t.actions.cancel}
        destructive={confirmState?.destructive}
        busy={confirmBusy}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
