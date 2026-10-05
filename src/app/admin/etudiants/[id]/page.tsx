import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, FileText, MessageSquare, PenLine, User } from 'lucide-react';
import { StatCard } from '@/components/admin/stat-card';
import { ResetPasswordButton } from '@/components/admin/reset-password-button';
import { ExportPdfButton } from '@/components/admin/export-pdf-button';
import { ChangeStudentGroupButton } from '@/components/admin/change-student-group-button';
import { GroupBadge } from '@/components/admin/group-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConversationTranscript } from '@/components/shared/conversation-transcript';
import { ExpressionVersionsList } from '@/components/shared/expression-versions-list';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDateFr } from '@/lib/utils';
import { isAppError } from '@/lib/errors';
import { getStudentDetail } from '@/server/services/adminService';
import { getExperimentById } from '@/server/services/experimentService';

const t = getDictionary();

export const metadata: Metadata = { title: t.students.detailTitle };
export const dynamic = 'force-dynamic';

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getStudentDetail>>;
  try {
    // No experiment filter here: the administrator sees the active experiment.
    detail = await getStudentDetail(id);
  } catch (error) {
    if (isAppError(error) && error.code === 'STUDENT_NOT_FOUND') notFound();
    throw error;
  }

  const { student, experiment, messages, versions } = detail;
  const experimentRecord = experiment ? await getExperimentById(experiment.id) : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/etudiants">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.students.detailBack}
        </Link>
      </Button>

      <PageHeader
        title={student.username}
        subtitle={`${t.students.accountCreated} ${formatDateFr(student.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {experiment ? (
              <Badge variant={experiment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {experimentRecord
                  ? t.experiments.experimentNumber.replace('{n}', String(experimentRecord.sequence))
                  : t.students.activity}
                {experiment.status === 'ACTIVE' ? ` · ${t.experiments.statusActive}` : ''}
              </Badge>
            ) : null}
            <GroupBadge group={student.group} />
            {experiment ? <ExportPdfButton studentId={student.id} experimentId={experiment.id} size="sm" /> : null}
            <ChangeStudentGroupButton studentId={student.id} group={student.group} />
            <ResetPasswordButton studentId={student.id} size="sm" />
          </div>
        }
      />

      {/* Synthèse */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t.students.messagesCount}
          value={messages.length}
          icon={MessageSquare}
          tone="ai"
        />
        <StatCard
          label={t.students.versionsCount}
          value={versions.length}
          icon={FileText}
          tone="success"
        />
        <StatCard
          label={t.students.lastActivity}
          value={
            detail.lastActivityAt ? (
              <DateTime value={detail.lastActivityAt} />
            ) : (
              t.students.never
            )
          }
          icon={User}
          tone="neutral"
        />
      </section>

      {experiment ? (
        <Card className="bg-muted/40">
          <CardContent className="pt-5 sm:pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.admin.experimentQuestion}
            </p>
            <p className="heading-serif mt-2 text-base leading-relaxed sm:text-lg">
              {experiment.question}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Conversation IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-ai" aria-hidden />
            {t.students.conversationTitle}
          </CardTitle>
          <CardDescription>{experiment ? t.students.activity : undefined}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConversationTranscript
            messages={messages}
            emptyTitle={t.students.conversationEmpty}
          />
        </CardContent>
      </Card>

      {/* Expression écrite */}
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
            versions={versions}
            emptyTitle={t.students.expressionEmpty}
          />
        </CardContent>
      </Card>
    </div>
  );
}