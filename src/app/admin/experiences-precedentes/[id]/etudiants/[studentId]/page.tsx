import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, PenLine } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConversationTranscript } from '@/components/shared/conversation-transcript';
import { ExpressionVersionsList } from '@/components/shared/expression-versions-list';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { isAppError } from '@/lib/errors';
import {
  getExperimentParticipantDetail,
} from '@/server/services/experimentService';

const t = getDictionary();

export const metadata: Metadata = { title: t.experiments.studentActivityTitle };
export const dynamic = 'force-dynamic';

/**
 * Navigation: Expérience → Étudiant → Conversation IA → Expression écrite.
 */
export default async function ExperimentStudentPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id, studentId } = await params;

  let detail: Awaited<ReturnType<typeof getExperimentParticipantDetail>>;
  try {
    detail = await getExperimentParticipantDetail(id, studentId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/admin/experiences-precedentes/${id}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.experiments.backToExperiment}
        </Link>
      </Button>

      <PageHeader
        title={detail.username}
        subtitle={`${t.experiments.studentActivityTitle} · ${t.experiments.messagesAndVersions
          .replace('{messages}', String(detail.aiMessages))
          .replace('{versions}', String(detail.expressionVersions))}`}
        actions={
          <span className="text-xs text-muted-foreground">
            {t.students.lastActivity} : <DateTime value={detail.lastActivityAt} />
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-ai" aria-hidden />
            {t.students.conversationTitle}
          </CardTitle>
          <CardDescription>{t.student.aiIndependentNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConversationTranscript
            messages={detail.messages}
            emptyTitle={t.students.conversationEmpty}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-success" aria-hidden />
            {t.students.expressionTitle}
          </CardTitle>
          <CardDescription>{t.student.expressionSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ExpressionVersionsList
            versions={detail.versions}
            emptyTitle={t.students.expressionEmpty}
          />
        </CardContent>
      </Card>
    </div>
  );
}