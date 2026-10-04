'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, FileText, ShieldAlert } from 'lucide-react';
import { AIChat } from '@/components/student/ai-chat';
import { ExpressionPanel } from '@/components/student/expression-panel';
import { QuestionCard } from '@/components/student/question-card';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import type { AIMessage, ExpressionVersion } from '@/types';

const t = getDictionary();

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
 * Student workspace.
 *
 * One single screen: the question of the day on top, then the conversation with
 * the Assistant IA and the Expression écrite side by side on a large screen and
 * one after the other on a phone. The student never has to switch tabs, and the
 * two areas stay strictly independent — no writing is ever sent to the AI.
 */
export function StudentWorkspace({
  experiment,
  initialMessages,
  initialVersions,
}: StudentWorkspaceProps) {
  const router = useRouter();
  const [suspended, setSuspended] = React.useState(false);
  // Kept in state so the counters follow the live data, not the snapshot
  // rendered on the server.
  const [messageCount, setMessageCount] = React.useState(initialMessages.length);
  const [versionCount, setVersionCount] = React.useState(initialVersions.length);

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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Espace 1 — Assistant IA */}
        <section
          aria-label={t.student.aiTitle}
          className="flex flex-col gap-3 rounded-lg border border-ai/20 bg-ai-soft/30 p-3 sm:p-4"
        >
          <header>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ai">
              <Bot className="h-4 w-4" aria-hidden />
              <span className="truncate">{t.student.aiTitle}</span>
              <CountBadge>{t.common.plural(messageCount, t.common.message, t.common.messages)}</CountBadge>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t.student.aiSubtitle}
            </p>
          </header>

          <AIChat
            experimentId={experiment.id}
            initialMessages={initialMessages}
            onCountChange={setMessageCount}
          />
        </section>

        {/* Espace 2 — Expression écrite */}
        <section aria-label={t.student.expressionTitle} className="flex flex-col gap-3">
          <header>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-success">
              <FileText className="h-4 w-4" aria-hidden />
              <span className="truncate">{t.student.expressionTitle}</span>
              <CountBadge>{t.common.plural(versionCount, t.common.version, t.common.versions)}</CountBadge>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t.student.expressionSubtitle}
            </p>
          </header>

          <ExpressionPanel
            experimentId={experiment.id}
            initialVersions={initialVersions}
            onCountChange={setVersionCount}
          />
        </section>
      </div>
    </div>
  );
}

/** Live counter shown next to a section title ("1 message", "3 messages"). */
function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}