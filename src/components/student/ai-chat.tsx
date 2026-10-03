'use client';

import * as React from 'react';
import { Bot, Send, ShieldCheck, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Spinner } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types';

const t = getDictionary();

interface ChatPayload {
  studentMessage: { id: string; content: string; createdAt: string };
  assistantMessage: { id: string; content: string; createdAt: string };
}

interface AIChatProps {
  experimentId: string;
  initialMessages: AIMessage[];
}

/**
 * Assistant IA chat.
 * Completely independent from the writing space: no question, no version of the
 * student's writing is ever sent here automatically.
 */
export function AIChat({ experimentId, initialMessages }: AIChatProps) {
  const [messages, setMessages] = React.useState<AIMessage[]>(initialMessages);
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, experimentId]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, pending]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      setError(ERROR_MESSAGES.AI_MESSAGE_EMPTY);
      return;
    }
    if (pending) return;

    setPending(true);
    setError(null);
    setDraft('');

    // Optimistic display of the student message.
    const optimisticId = `pending-${Date.now()}`;
    setMessages((previous) => [
      ...previous,
      {
        id: optimisticId,
        studentId: '',
        experimentId,
        role: 'student',
        content,
        createdAt: new Date(),
      },
    ]);

    try {
      const response = await fetch('/api/student/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessages((previous) => previous.filter((message) => message.id !== optimisticId));
        setDraft(content);
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.AI_UNAVAILABLE);
      }

      const payload = (await response.json()) as ChatPayload;
      setMessages((previous) => [
        ...previous.filter((message) => message.id !== optimisticId),
        {
          id: payload.studentMessage.id,
          studentId: '',
          experimentId,
          role: 'student',
          content: payload.studentMessage.content,
          createdAt: new Date(payload.studentMessage.createdAt),
        },
        {
          id: payload.assistantMessage.id,
          studentId: '',
          experimentId,
          role: 'assistant',
          content: payload.assistantMessage.content,
          createdAt: new Date(payload.assistantMessage.createdAt),
        },
      ]);
      textareaRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ERROR_MESSAGES.AI_UNAVAILABLE);
    } finally {
      setPending(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-slim flex max-h-[52vh] min-h-[280px] flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-4 sm:max-h-[58vh]"
        aria-live="polite"
      >
        {empty ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <EmptyState
              icon={<Bot className="h-7 w-7 text-ai" />}
              title={t.student.aiEmpty}
              description={t.student.aiEmptyHint}
            />
          </div>
        ) : (
          messages.map((message) => {
            const isStudent = message.role === 'student';
            const isOptimistic = message.id.startsWith('pending-');
            return (
              <div
                key={message.id}
                className={cn('flex flex-col gap-1.5', isStudent ? 'items-end' : 'items-start')}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isStudent ? null : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ai/10 text-ai">
                      <Bot className="h-3 w-3" aria-hidden />
                    </span>
                  )}
                  <span className="font-medium">
                    {isStudent ? t.student.aiTitle : t.students.assistant}
                  </span>
                  <DateTime value={message.createdAt} className="tabular-nums" />
                  {isStudent ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <User className="h-3 w-3" aria-hidden />
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'max-w-[min(40rem,90%)] rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:px-4 sm:py-3',
                    isStudent
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-ai/25 bg-ai-soft',
                    isOptimistic && 'opacity-60',
                  )}
                >
                  <p className="preserve-lines">{message.content}</p>
                </div>
              </div>
            );
          })
        )}

        {pending ? (
          <div className="flex items-center gap-2 rounded-lg border border-ai/25 bg-ai-soft px-3.5 py-2.5 text-ai">
            <Sparkles className="h-4 w-4" aria-hidden />
            <Spinner label={t.student.aiSending} className="text-ai" />
          </div>
        ) : null}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-ai" aria-hidden />
        {t.student.aiIndependentNote}
      </p>

      <form onSubmit={handleSend} className="mt-3 space-y-2" noValidate>
        <Textarea
          ref={textareaRef}
          name="message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={t.student.aiPlaceholder}
          rows={3}
          maxLength={4000}
          disabled={pending}
          aria-label={t.student.aiPlaceholder}
          className="resize-y border-ai/30 focus-visible:border-ai focus-visible:ring-ai/25"
        />

        {error ? (
          <Alert tone="destructive" className="py-3">
            {error}
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {draft.length}/4000
          </span>
          <Button
            type="submit"
            variant="ai"
            loading={pending}
            disabled={pending || draft.trim().length === 0}
          >
            <Send className="h-4 w-4" aria-hidden />
            {pending ? t.student.aiSending : t.student.aiSend}
          </Button>
        </div>
      </form>
    </div>
  );
}