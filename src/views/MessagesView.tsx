import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, MessageSquare, Paperclip, Search, Send, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { ConversationRecord, MessageRecord } from '../types/app';

function formatTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagesView() {
  const {
    firebaseUser,
    profile,
    setAuthModalOpen,
    t,
    pushToast,
    selectedMessageTargetUid,
    clearMessageTarget,
    refreshTrigger,
  } = useApp();

  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [draftBody, setDraftBody] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [directTargetUid, setDirectTargetUid] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingConvs(true);
    try {
      const res = await apiRequest<{ conversations: ConversationRecord[] }>('/api/conversations');
      const list = res.conversations ?? [];
      setConversations(list);
      if (selectedMessageTargetUid) {
        const existing = list.find((c) => c.participant?.uid === selectedMessageTargetUid);
        if (existing) {
          setActiveConvId(existing.id);
          setDirectTargetUid(null);
        } else {
          setActiveConvId(null);
          setDirectTargetUid(selectedMessageTargetUid);
        }
        clearMessageTarget();
      } else if (!activeConvId && !directTargetUid && list.length > 0) {
        setActiveConvId(list[0].id);
      }
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : 'Unable to load conversations.',
        'error',
      );
    } finally {
      setLoadingConvs(false);
    }
  }, [firebaseUser, selectedMessageTargetUid, clearMessageTarget, activeConvId, directTargetUid, pushToast]);

  useEffect(() => {
    if (firebaseUser) {
      loadConversations();
    } else {
      setConversations([]);
      setMessages([]);
      setActiveConvId(null);
    }
  }, [firebaseUser, refreshTrigger, loadConversations]);

  const loadMessages = useCallback(
    async (convId: number, silent = false) => {
      if (!firebaseUser) return;
      if (!silent) setLoadingMsgs(true);
      try {
        const res = await apiRequest<{ messages: MessageRecord[] }>(
          `/api/conversations/${convId}/messages`,
        );
        setMessages(res.messages ?? []);
      } catch {
        if (!silent) {
          pushToast('Unable to load conversation messages.', 'error');
        }
      } finally {
        if (!silent) setLoadingMsgs(false);
      }
    },
    [firebaseUser, pushToast],
  );

  useEffect(() => {
    if (!activeConvId || !firebaseUser) {
      if (!activeConvId) setMessages([]);
      return;
    }
    loadMessages(activeConvId);
    const interval = window.setInterval(() => {
      loadMessages(activeConvId, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeConvId, firebaseUser, loadMessages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = c.participant?.fullName?.toLowerCase() ?? '';
      const last = c.lastMessage?.body?.toLowerCase() ?? '';
      return name.includes(q) || last.includes(q);
    });
  }, [conversations, searchQuery]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftBody.trim();
    if (!trimmed || (!activeConvId && !directTargetUid)) return;
    setSending(true);
    try {
      const res = await apiRequest<{ message: MessageRecord }>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeConvId ?? undefined,
          recipientUid: !activeConvId ? directTargetUid : undefined,
          body: trimmed,
          attachmentName: attachmentName.trim() || null,
          attachmentUrl: attachmentUrl.trim() || null,
        }),
      });
      setDraftBody('');
      setAttachmentName('');
      setAttachmentUrl('');
      setShowAttach(false);

      if (!activeConvId && res.message.conversationId) {
        setActiveConvId(res.message.conversationId);
        setDirectTargetUid(null);
      }
      setMessages((prev) => [...prev, res.message]);
      await loadConversations();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-8 text-center">
        <MessageSquare className="mx-auto h-7 w-7 text-[#777987]" />
        <h2 className="mt-3 text-lg font-semibold text-[#171820] dark:text-[#F2F3F7]">
          {t.messages.title}
        </h2>
        <p className="mt-2 text-sm text-[#777987] dark:text-[#9B9EAC]">
          {t.dashboard.signInPrompt}
        </p>
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="mt-5 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors"
        >
          {t.actions.signIn}
        </button>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-8.25rem)] min-h-[540px] grid-cols-1 overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] lg:grid-cols-[310px_1fr]">
      {/* Left pane: Conversation List */}
      <aside className="flex flex-col border-b border-black/[0.06] dark:border-white/[0.08] lg:border-b-0 lg:border-e">
        <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
              {t.messages.title}
            </h2>
            <span className="font-mono text-xs text-[#777987] dark:text-[#9B9EAC]">
              {conversations.length}
            </span>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#777987]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.actions.searchPlaceholder}
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] py-1.5 ps-8 pe-3 text-xs text-[#171820] dark:text-[#F2F3F7] placeholder:text-[#777987] focus:border-[#7657E8] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {directTargetUid && !activeConvId && (
            <div className="bg-[#7657E8]/10 px-4 py-3">
              <p className="text-xs font-medium text-[#7657E8]">New Direct Conversation</p>
              <p className="mt-0.5 truncate text-xs text-[#777987] dark:text-[#9B9EAC]">
                Send your first message below to open this thread.
              </p>
            </div>
          )}

          {loadingConvs && conversations.length === 0 ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-[#F5F6F8] dark:bg-white/[0.04] animate-pulse"
                />
              ))}
            </div>
          ) : filteredConversations.length === 0 && !directTargetUid ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                {t.messages.emptyConversations}
              </p>
              <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                {t.messages.emptyConversationsDesc}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const selected = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => {
                    setActiveConvId(conv.id);
                    setDirectTargetUid(null);
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors ${
                    selected
                      ? 'bg-[#F5F6F8] dark:bg-white/[0.06]'
                      : 'hover:bg-[#F5F6F8]/60 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  {conv.participant?.photoUrl ? (
                    <img
                      src={conv.participant.photoUrl}
                      alt={conv.participant.fullName}
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7657E8]/15 text-xs font-semibold text-[#7657E8]">
                      {(conv.participant?.fullName || 'U').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                        {conv.participant?.fullName || 'Workspace Member'}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-[#777987]">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-[#777987] dark:text-[#9B9EAC]">
                        {conv.lastMessage?.body || conv.participant?.title || 'No messages yet'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 rounded-full bg-[#7657E8] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right pane: Active Thread */}
      <section className="flex min-h-0 flex-col bg-[#F5F6F8]/40 dark:bg-[#101116]/40">
        {!activeConversation && !directTargetUid ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-8 w-8 text-[#777987]" />
            <p className="mt-3 text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
              {t.messages.selectConversation}
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <header className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                {activeConversation?.participant?.photoUrl ? (
                  <img
                    src={activeConversation.participant.photoUrl}
                    alt={activeConversation.participant.fullName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7657E8]/15 text-[#7657E8]">
                    <User className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                    {activeConversation?.participant?.fullName || 'New Conversation'}
                  </h3>
                  <p className="truncate text-xs text-[#777987] dark:text-[#9B9EAC]">
                    {activeConversation?.participant?.title
                      ? `${activeConversation.participant.title} · ${activeConversation.participant.availability}`
                      : activeConversation?.projectId
                        ? `Project #${activeConversation.projectId}`
                        : 'Direct workspace thread'}
                  </p>
                </div>
              </div>
            </header>

            {/* Message Feed */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {loadingMsgs && messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="h-12 w-2/3 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
                  <div className="ms-auto h-12 w-1/2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Start the conversation with a clear project brief or question.
                </div>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderUid === profile?.uid || msg.senderUid === firebaseUser.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          mine
                            ? 'bg-[#7657E8] text-white'
                            : 'border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-[#F2F3F7]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        {msg.attachmentUrl && (
                          <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mt-2 inline-flex items-center gap-1.5 text-xs underline ${
                              mine ? 'text-white/90' : 'text-[#7657E8]'
                            }`}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            <span>{msg.attachmentName || msg.attachmentUrl}</span>
                          </a>
                        )}
                      </div>
                      <span className="mt-1 px-1 font-mono text-[10px] text-[#777987]">
                        {formatTime(msg.createdAt)}
                        {mine && msg.readAt ? ' · Read' : ''}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSend}
              className="border-t border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-3.5"
            >
              {showAttach && (
                <div className="mb-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    placeholder="Link label (e.g. Figma Spec)"
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                  <input
                    type="url"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="https://..."
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAttach((s) => !s)}
                  aria-label="Attach link"
                  className={`rounded-lg p-2 transition-colors ${
                    showAttach
                      ? 'bg-[#7657E8]/15 text-[#7657E8]'
                      : 'text-[#777987] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder={t.messages.typeMessage}
                  className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3.5 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] placeholder:text-[#777987] focus:border-[#7657E8] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draftBody.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{t.messages.send}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
