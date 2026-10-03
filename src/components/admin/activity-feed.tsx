import Link from 'next/link';
import { Bot, FileText, MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/alert';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ActivityEvent } from '@/types';

const t = getDictionary();

const kindMeta = {
  ai_message: {
    label: t.admin.activityAI,
    icon: MessageSquare,
    className: 'bg-ai/10 text-ai',
  },
  expression: {
    label: t.admin.activityExpression,
    icon: FileText,
    className: 'bg-success/10 text-success',
  },
  login: {
    label: t.admin.activityLogin,
    icon: Bot,
    className: 'bg-muted text-muted-foreground',
  },
} as const;

/** Chronological feed of the students' activity on the active experiment. */
export function ActivityFeed({
  events,
  showLinks = false,
}: {
  events: ActivityEvent[];
  showLinks?: boolean;
}) {
  if (events.length === 0) {
    return <EmptyState title={t.admin.recentActivityEmpty} />;
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => {
        const meta = kindMeta[event.kind];
        const Icon = meta.icon;
        const content = (
          <>
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                meta.className,
              )}
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <span className="font-mono text-[13px]">{event.studentUsername}</span>
                <span className="text-muted-foreground"> · {meta.label}</span>
              </p>
              {event.detail ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.detail}</p>
              ) : null}
            </div>
            <DateTime
              value={event.createdAt}
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
            />
          </>
        );

        return (
          <li key={`${event.kind}-${event.id}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            {showLinks ? (
              <Link
                href={`/admin/etudiants/${event.studentId}`}
                className="flex min-w-0 flex-1 items-start gap-3 rounded-md transition-colors hover:bg-muted/60"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}