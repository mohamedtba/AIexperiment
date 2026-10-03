'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, FileText, ShieldAlert } from 'lucide-react';
import { AIChat } from '@/components/student/ai-chat';
import { ExpressionPanel } from '@/components/student/expression-panel';
import { QuestionCard } from '@/components/student/question-card';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AIMessage, ExpressionVersion } from '@/types';

const t = getDictionary();

type WorkspaceTab = 'ai' | 'expression';

interface StudentWorkspaceProps {
  experiment: {
    id: string;
    sequence: number;
    question: string;
    startedAt: string;
  };
  initialMessages: AIMessage[];
  initialVersions: ExpressionVersion[];
}

/**
 * Student workspace: the question of the day on top, then two completely
 * independent areas (Assistant IA / Expression écrite).
 */
export function StudentWorkspace({
  experiment,
  initialMessages,
  initialVersions,
}: StudentWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<WorkspaceTab>('ai');
  const [suspended, setSuspended] = React.useState(false);

  // Detects immediately that the administrator suspended the access:
  // the student session is then revoked and the interface shows the message.
  React.useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { valid?: boolean; authenticated?: boolean };
        if (!active) return;
        if (data.authenticated === false || data.valid === false) {
          setSuspended(true);
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
          router.replace('/acces-suspendu');
          router.refresh();
        }
      } catch {
        // Network issue: keep the current state, the next check will retry.
      }
    }

    const timer = window.setInterval(checkSession, 15_000);
    const onFocus = () => void checkSession();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [router]);

  return (
    <div className="space-y-4">
      <QuestionCard
        question={experiment.question}
        sequence={experiment.sequence}
        startedAt={experiment.startedAt}
      />

      {suspended ? (
        <Alert tone="warning" icon={<ShieldAlert className="h-4 w-4" />}>
          {t.student.accessSuspendedBody}
        </Alert>
      ) : null}

      {/* Sélecteur d'espace */}
      <div
        role="tablist"
        aria-label={t.student.tabsLabel}
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
      >
        <TabButton
          active={tab === 'ai'}
          onClick={() => setTab('ai')}
          icon={<Bot className="h-4 w-4" aria-hidden />}
          label={t.student.aiOpen}
          count={initialMessages.length}
          activeClassName="text-ai"
        />
        <TabButton
          active={tab === 'expression'}
          onClick={() => setTab('expression')}
          icon={<FileText className="h-4 w-4" aria-hidden />}
          label={t.student.switchToExpression}
          count={initialVersions.length}
          activeClassName="text-success"
        />
      </div>

      {tab === 'ai' ? (
        <section
          role="tabpanel"
          aria-label={t.student.aiTitle}
          className="space-y-3 rounded-lg border border-ai/20 bg-ai-soft/30 p-3 sm:p-4"
        >
          <header>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ai">
              <Bot className="h-4 w-4" aria-hidden />
              {t.student.aiTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t.student.aiSubtitle}
            </p>
          </header>
          <AIChat
            experimentId={experiment.id}
            initialMessages={initialMessages}
          />
        </section>
      ) : (
        <section role="tabpanel" aria-label={t.student.expressionTitle}>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {t.student.expressionSubtitle}
          </p>
          <ExpressionPanel
            experimentId={experiment.id}
            initialVersions={initialVersions}
          />
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  activeClassName,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  activeClassName: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? cn('bg-card shadow-sm', activeClassName)
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
          active ? cn('bg-muted', activeClassName) : 'bg-background text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}