import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Maximize2,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Search,
  Send,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { useLiveVoice } from '../hooks/useLiveVoice';
import type { AiConversationRecord, AiMessageRecord, PageId } from '../types/app';
import { LensSymbol } from './BrandIcons';

interface PendingConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
}

interface LensPanelProps {
  compact?: boolean;
  onClose?: () => void;
}

function renderFormattedText(content: string) {
  const segments = content.split(/(```[\s\S]*?```)/g);
  return segments.map((segment, idx) => {
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const code = segment.replace(/^```\w*\n?/, '').replace(/```$/, '');
      return (
        <pre
          key={idx}
          className="my-2 overflow-x-auto rounded-lg bg-[#101116] p-3 font-mono text-xs text-[#F2F3F7]"
        >
          <code>{code}</code>
        </pre>
      );
    }
    return (
      <div key={idx} className="whitespace-pre-wrap leading-relaxed">
        {segment}
      </div>
    );
  });
}

export function LensPanel({ compact = false, onClose }: LensPanelProps) {
  const {
    firebaseUser,
    activePage,
    setActivePage,
    language,
    t,
    refreshProfile,
    triggerDataRefresh,
    setAuthModalOpen,
    pushToast,
    lensPrefillPrompt,
    clearLensPrefill,
  } = useApp();

  const [conversations, setConversations] = useState<AiConversationRecord[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessageRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const liveVoice = useLiveVoice(language);

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) {
      setConversations([]);
      return;
    }
    try {
      const res = await apiRequest<{ conversations: AiConversationRecord[] }>(
        '/api/lens/conversations',
      );
      setConversations(res.conversations ?? []);
    } catch {
      // Non-fatal
    }
  }, [firebaseUser]);

  const loadMessages = useCallback(
    async (convId: number) => {
      if (!firebaseUser) return;
      try {
        const res = await apiRequest<{ messages: AiMessageRecord[] }>(
          `/api/lens/conversations/${convId}/messages`,
        );
        setMessages(res.messages ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load conversation.');
      }
    },
    [firebaseUser],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    } else {
      setMessages([]);
    }
  }, [selectedConvId, loadMessages]);

  useEffect(() => {
    if (lensPrefillPrompt) {
      setInput(lensPrefillPrompt);
      clearLensPrefill();
    }
  }, [lensPrefillPrompt, clearLensPrefill]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, liveVoice.transcripts]);

  const applyClientActions = useCallback(
    async (
      actions: Array<{ type: string; page?: string; mode?: string; scope?: string }> | undefined,
    ) => {
      if (!actions || !actions.length) return;
      for (const act of actions) {
        if (act.type === 'navigate' && act.page) {
          setActivePage(act.page as PageId);
        } else if (act.type === 'mode_changed') {
          await refreshProfile();
          triggerDataRefresh();
        } else if (act.type === 'data_mutated') {
          if (act.scope === 'profile') await refreshProfile();
          triggerDataRefresh();
        }
      }
    },
    [setActivePage, refreshProfile, triggerDataRefresh],
  );

  const sendMessageText = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || sending) return;

    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }

    setError(null);
    setSending(true);
    setInput('');
    setPendingConfirmations([]);

    const optimisticUser: AiMessageRecord = {
      id: Date.now(),
      conversationId: selectedConvId ?? 0,
      role: 'user',
      content: text,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await apiRequest<{
        conversationId: number;
        message: AiMessageRecord;
        clientActions?: Array<{ type: string; page?: string; mode?: string; scope?: string }>;
        pendingConfirmations?: PendingConfirmation[];
      }>('/api/lens/chat', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: selectedConvId ?? undefined,
          message: text,
          language,
          currentPage: activePage,
        }),
      });

      setSelectedConvId(res.conversationId);
      setMessages((prev) => [...prev, res.message]);
      setPendingConfirmations(res.pendingConfirmations ?? []);
      await applyClientActions(res.clientActions);
      await loadConversations();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setError('Generation stopped.');
      } else {
        setError(err instanceof Error ? err.message : 'Lens AI request failed.');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const handleConfirmTool = async (item: PendingConfirmation) => {
    if (!selectedConvId) return;
    setConfirmBusy(true);
    try {
      const res = await apiRequest<{
        message: AiMessageRecord;
        clientActions?: Array<{ type: string; page?: string; mode?: string; scope?: string }>;
      }>('/api/lens/confirm-tool', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConvId,
          toolName: item.toolName,
          args: item.args,
        }),
      });
      setMessages((prev) => [...prev, res.message]);
      setPendingConfirmations((prev) => prev.filter((p) => p !== item));
      await applyClientActions(res.clientActions);
      pushToast('Action confirmed and executed.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Action confirmation failed.', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleCopy = async (id: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(historyFilter.trim().toLowerCase()),
  );

  return (
    <div
      className={`flex h-full overflow-hidden ${
        compact
          ? 'flex-col'
          : 'rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]'
      }`}
    >
      {!compact && (
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-e border-black/8 dark:border-white/8 bg-[#F9FAFC] dark:bg-[#15171E]">
          <div className="p-3.5 border-b border-black/8 dark:border-white/8">
            <button
              type="button"
              onClick={() => {
                setSelectedConvId(null);
                setMessages([]);
                setPendingConfirmations([]);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7657E8] px-3 py-2 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t.lens.newChat}</span>
            </button>
            <div className="relative mt-2.5">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-[#777987]" />
              <input
                type="text"
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder={t.lens.searchHistory}
                aria-label={t.lens.searchHistory}
                className="w-full rounded-lg border border-black/8 dark:border-white/10 bg-white dark:bg-[#101116] py-1.5 ps-8 pe-2.5 text-xs focus:border-[#7657E8] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConvs.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-xs text-[#777987]">
                {firebaseUser ? 'No saved sessions yet.' : 'Sign in to store session history.'}
              </p>
            ) : (
              filteredConvs.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-start text-xs transition-colors truncate ${
                    selectedConvId === conv.id
                      ? 'bg-[#7657E8]/12 font-medium text-[#7657E8]'
                      : 'text-[#171820] dark:text-[#D5D7E0] hover:bg-black/5 dark:hover:bg-white/6'
                  }`}
                >
                  {conv.title}
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/8 dark:border-white/8 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7657E8]/12 text-[#7657E8] shrink-0">
              <LensSymbol className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{t.lens.title}</h2>
              {!compact && (
                <p className="text-xs text-[#777987] truncate">{t.lens.subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                liveVoice.status === 'active' || liveVoice.status === 'connecting'
                  ? liveVoice.stopSession()
                  : liveVoice.startSession()
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                liveVoice.status === 'active'
                  ? 'bg-[#E36C76] text-white'
                  : 'border border-black/10 dark:border-white/12 text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/8'
              }`}
              aria-label={liveVoice.status === 'active' ? t.actions.stopVoice : t.actions.startVoice}
            >
              {liveVoice.status === 'active' ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              <span>
                {liveVoice.status === 'active'
                  ? t.actions.stopVoice
                  : liveVoice.status === 'connecting'
                    ? 'Connecting...'
                    : 'Live Voice'}
              </span>
            </button>

            {compact && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('lens');
                    onClose?.();
                  }}
                  aria-label="Expand Lens AI to full workspace"
                  className="rounded-lg p-1.5 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close Lens AI panel"
                    className="rounded-lg p-1.5 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Live Voice Status Bar (Gemini 3.8 Live) */}
        {(liveVoice.status !== 'idle' || liveVoice.error || liveVoice.transcripts.length > 0) && (
          <div className="border-b border-black/8 dark:border-white/8 bg-[#F5F6F8] dark:bg-[#12141B] px-4 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {liveVoice.status === 'active' && (
                  <span className="h-2 w-2 rounded-full bg-[#39B982] animate-pulse" />
                )}
                <span className="font-medium">
                  {liveVoice.status === 'active' ? t.lens.voiceActive : t.lens.voiceReady}
                </span>
              </div>
              {liveVoice.transcripts.length > 0 && (
                <button
                  type="button"
                  onClick={liveVoice.clearTranscripts}
                  className="text-[#777987] hover:text-[#171820] dark:hover:text-white"
                >
                  Clear transcript
                </button>
              )}
            </div>
            {liveVoice.error && (
              <p className="mt-1 text-[#c74954] dark:text-[#f08b94]">{liveVoice.error}</p>
            )}
            {liveVoice.transcripts.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto space-y-1 text-[#777987] dark:text-[#C4C6D2]">
                {liveVoice.transcripts.map((entry) => (
                  <p key={entry.id}>
                    <span className="font-medium text-[#171820] dark:text-white">
                      {entry.role === 'user' ? 'You: ' : 'Lens AI: '}
                    </span>
                    {entry.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="py-6 space-y-5">
              <div>
                <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                  Authorized workspace agent
                </p>
                <p className="mt-1 text-xs text-[#777987] leading-relaxed">
                  Command Firework AI directly: switch between Work and Sleep Mode, query open projects or freelancers, schedule tasks, or open any screen.
                </p>
              </div>
              <div className="space-y-2">
                {t.lens.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessageText(prompt)}
                    className="block w-full rounded-xl border border-black/8 dark:border-white/10 bg-[#F9FAFC] dark:bg-[#14161D] px-3.5 py-2.5 text-start text-xs text-[#171820] dark:text-[#E5E7F0] hover:border-[#7657E8]/50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#7657E8] text-white'
                      : 'border border-black/8 dark:border-white/10 bg-[#F9FAFC] dark:bg-[#14161D] text-[#171820] dark:text-[#F2F3F7]'
                  }`}
                >
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2.5 space-y-1 border-b border-black/8 dark:border-white/10 pb-2">
                      {msg.toolCalls.map((tc, idx) => (
                        <div
                          key={`${tc.toolName}-${idx}`}
                          className="flex items-center gap-2 text-xs text-[#777987] dark:text-[#9B9EAC]"
                        >
                          <Wrench className="h-3 w-3 text-[#7657E8] shrink-0" />
                          <span className="font-mono">{tc.toolName}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              tc.status === 'error'
                                ? 'text-[#E36C76]'
                                : tc.status === 'requires_confirmation'
                                  ? 'text-[#E6AE53]'
                                  : 'text-[#39B982]'
                            }
                          >
                            {tc.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {renderFormattedText(msg.content)}
                </div>

                {msg.role === 'model' && (
                  <div className="mt-1 flex items-center gap-3 px-1 text-xs text-[#777987]">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 hover:text-[#171820] dark:hover:text-white"
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-3 w-3 text-[#39B982]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>
                    {lastUserMessage && (
                      <button
                        type="button"
                        onClick={() => sendMessageText(lastUserMessage.content)}
                        disabled={sending}
                        className="inline-flex items-center gap-1 hover:text-[#171820] dark:hover:text-white disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Regenerate</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {pendingConfirmations.length > 0 && (
            <div className="space-y-2">
              {pendingConfirmations.map((item, idx) => (
                <div
                  key={`${item.toolName}-${idx}`}
                  className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F5F6F8] dark:bg-[#14161D] p-3.5 text-xs"
                >
                  <p className="font-medium text-[#171820] dark:text-white">Confirmation required</p>
                  <p className="mt-1 text-[#777987]">{item.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={confirmBusy}
                      onClick={() => handleConfirmTool(item)}
                      className="rounded-lg bg-[#7657E8] px-3 py-1.5 font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
                    >
                      Confirm & Execute
                    </button>
                    <button
                      type="button"
                      disabled={confirmBusy}
                      onClick={() =>
                        setPendingConfirmations((prev) => prev.filter((p) => p !== item))
                      }
                      className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 font-medium text-[#777987]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-[#777987]">
              <span>Lens AI is analyzing intent and running workspace tools...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-[#E36C76]/12 px-3.5 py-2.5 text-xs text-[#c74954] dark:text-[#f08b94]">
              {error}
            </div>
          )}
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessageText();
          }}
          className="border-t border-black/8 dark:border-white/8 p-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.lens.placeholder}
              aria-label="Message Lens AI"
              className="flex-1 rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3.5 py-2.5 text-sm focus:border-[#7657E8] focus:outline-none"
            />
            {sending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generation"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E36C76] text-white hover:bg-[#cf5863]"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message to Lens AI"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7657E8] text-white hover:bg-[#6446d6] disabled:opacity-45 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
