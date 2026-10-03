import { Bot, User } from 'lucide-react';
import { EmptyState } from '@/components/ui/alert';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types';

const t = getDictionary();

interface ConversationTranscriptProps {
  messages: AIMessage[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * Full AI conversation, alternating between the student and the assistant.
 * Used by the administrator to review the complete interaction.
 */
export function ConversationTranscript({
  messages,
  emptyTitle = t.students.conversationEmpty,
  emptyDescription,
  className,
}: ConversationTranscriptProps) {
  if (messages.length === 0) {
    return <EmptyState icon={<Bot className="h-6 w-6 text-ai" />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {messages.map((message) => {
        const isStudent = message.role === 'student';
        return (
          <div
            key={message.id}
            className={cn('flex flex-col gap-1.5', isStudent ? 'items-end' : 'items-start')}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isStudent ? null : <Bot className="h-3.5 w-3.5 text-ai" aria-hidden />}
              <span className="font-medium">{isStudent ? t.students.you : t.students.assistant}</span>
              <DateTime value={message.createdAt} className="tabular-nums" />
              {isStudent ? <User className="h-3.5 w-3.5" aria-hidden /> : null}
            </div>
            <div
              className={cn(
                'max-w-[min(46rem,88%)] rounded-lg border px-4 py-3 text-sm leading-relaxed shadow-sm',
                isStudent
                  ? 'border-primary/20 bg-primary/5 text-foreground'
                  : 'border-ai/20 bg-ai-soft text-foreground',
              )}
            >
              <p className="preserve-lines">{message.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}