import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, ChevronRight, FileText, MessageSquare, Users } from 'lucide-react';
import { StatCard } from '@/components/admin/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr, formatDurationFr } from '@/lib/utils';
import { isAppError } from '@/lib/errors';
import { getExperimentOverview } from '@/server/services/experimentService';

const t = getDictionary();

export const metadata: Metadata = { title: t.experiments.experimentDetailTitle };
export const dynamic = 'force-dynamic';

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let overview: Awaited<ReturnType<typeof getExperimentOverview>>;
  try {
    overview = await getExperimentOverview(id);
  } catch (error) {
    if (isAppError(error) && error.code === 'EXPERIMENT_NOT_FOUND') notFound();
    throw error;
  }

  const { experiment, stats, participants } = overview;
  const isActive = experiment.status === 'ACTIVE';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/experiences-precedentes">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.experiments.backToExperiments}
        </Link>
      </Button>

      <PageHeader
        title={t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))}
        subtitle={`${t.experiments.startedAt} ${formatDateTimeFr(experiment.startedAt)}`}
        actions={
          <Badge variant={isActive ? 'success' : 'neutral'}>
            {isActive ? t.experiments.statusActive : t.experiments.statusArchived}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.experimentQuestion}</CardTitle>
          <CardDescription>
            {experiment.archivedAt
              ? `${t.experiments.archivedAt} ${formatDateTimeFr(experiment.archivedAt)} · ${t.experiments.duration} ${formatDurationFr(experiment.startedAt, experiment.archivedAt)}`
              : `${t.experiments.duration} ${formatDurationFr(experiment.startedAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <blockquote className="heading-serif rounded-lg border-l-[3px] border-primary bg-muted/50 px-4 py-4 text-lg leading-relaxed">
            {experiment.question}
          </blockquote>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t.experiments.statsTitle}>
        <StatCard label={t.experiments.participants} value={stats.participants} icon={Users} tone="neutral" />
        <StatCard label={t.common.messages} value={stats.aiMessages} hint={`${stats.aiStudents} ${t.admin.cardAIUsers}`} icon={MessageSquare} tone="ai" />
        <StatCard label={t.common.versions} value={stats.expressionVersions} hint={`${stats.expressionStudents} ${t.common.students}`} icon={FileText} tone="success" />
        <StatCard label={t.admin.cardAIUsers} value={stats.aiStudents} icon={Bot} tone="primary" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t.experiments.participants}</CardTitle>
          <CardDescription>{t.students.activity}</CardDescription>
        </CardHeader>
        <CardContent>
          {participants.length === 0 ? (
            <EmptyState title={t.experiments.noParticipants} />
          ) : (
            <ul className="divide-y divide-border">
              {participants.map((participant) => (
                <li key={participant.studentId}>
                  <Link
                    href={`/admin/experiences-precedentes/${experiment.id}/etudiants/${participant.studentId}`}
                    className="flex items-center gap-4 rounded-md px-1 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-semibold tracking-wide">
                        {participant.username}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-ai" aria-hidden />
                          {participant.aiMessages} {t.common.messages}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-success" aria-hidden />
                          {participant.expressionVersions} {t.common.versions}
                        </span>
                        <span>
                          {t.students.lastActivity} :{' '}
                          <DateTime value={participant.lastActivityAt} />
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}