import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, FileText, History, Users } from 'lucide-react';
import { NewExperimentForm } from '@/components/admin/new-experiment-form';
import { StatCard } from '@/components/admin/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr, formatDurationFr } from '@/lib/utils';
import { getCurrentExperiment, getExperimentStats } from '@/server/services/experimentService';
import { experimentRepository } from '@/server/db/repositories/experiments';

const t = getDictionary();

export const metadata: Metadata = { title: t.experiments.currentTitle };
export const dynamic = 'force-dynamic';

export default async function CurrentExperimentPage() {
  const experiment = await getCurrentExperiment();
  const [stats, archivedCount] = await Promise.all([
    experiment ? getExperimentStats(experiment.id) : Promise.resolve(null),
    experimentRepository.count(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t.experiments.currentTitle} subtitle={t.experiments.currentSubtitle} />

      {/* Expérience active */}
      {experiment ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t.admin.experimentQuestion}
                <Badge variant="success">{t.experiments.statusActive}</Badge>
                <Badge variant="outline">
                  {t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {t.experiments.startedAt} {formatDateTimeFr(experiment.startedAt)} ·{' '}
                {t.experiments.duration} {formatDurationFr(experiment.startedAt)}
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href={`/admin/experiences-precedentes/${experiment.id}`}>
                {t.common.seeDetails}
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <blockquote className="heading-serif rounded-lg border-l-[3px] border-primary bg-muted/50 px-4 py-4 text-lg leading-relaxed">
              {experiment.question}
            </blockquote>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t.experiments.statsTitle}>
              <StatCard
                label={t.experiments.participants}
                value={stats?.participants ?? 0}
                icon={Users}
                tone="neutral"
              />
              <StatCard
                label={t.common.messages}
                value={stats?.aiMessages ?? 0}
                hint={t.common.plural(
                  stats?.aiStudents ?? 0,
                  t.admin.cardAIUser,
                  t.admin.cardAIUsers,
                )}
                icon={Bot}
                tone="ai"
              />
              <StatCard
                label={t.common.versions}
                value={stats?.expressionVersions ?? 0}
                hint={t.common.plural(
                  stats?.expressionStudents ?? 0,
                  t.common.student,
                  t.common.students,
                )}
                icon={FileText}
                tone="success"
              />
              <StatCard
                label={t.admin.experimentLastActivity}
                value={
                  stats ? (
                    <DateTime value={experiment.startedAt} mode="date" />
                  ) : (
                    '—'
                  )
                }
                icon={History}
                tone="primary"
              />
            </section>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            <EmptyState
              icon={<Bot className="h-6 w-6" />}
              title={t.admin.noExperimentTitle}
              description={t.admin.noExperimentBody}
            />
          </CardContent>
        </Card>
      )}

      {/* Nouvelle expérience */}
      <Card>
        <CardHeader>
          <CardTitle>{t.experiments.newTitle}</CardTitle>
          <CardDescription>{t.experiments.newIntro}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NewExperimentForm hasActiveExperiment={Boolean(experiment)} />
          {archivedCount > 0 ? (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href="/admin/experiences-precedentes">
                {t.nav.previousExperiments} ({archivedCount})
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}