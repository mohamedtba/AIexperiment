import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDurationFr } from '@/lib/utils';
import { listArchivedExperiments, getExperimentStats } from '@/server/services/experimentService';

const t = getDictionary();

export const metadata: Metadata = { title: t.experiments.previousTitle };
export const dynamic = 'force-dynamic';

export default async function PreviousExperimentsPage() {
  const experiments = await listArchivedExperiments();
  const stats = await Promise.all(
    experiments.map((experiment) => getExperimentStats(experiment.id)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.experiments.previousTitle}
        subtitle={t.experiments.previousSubtitle}
      />

      {experiments.length === 0 ? (
        <Card className="p-5 sm:p-6">
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title={t.experiments.previousEmpty}
            description={t.experiments.previousEmptyHint}
            action={
              <Button asChild size="sm">
                <Link href="/admin/experience">{t.nav.currentExperiment}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <ol className="space-y-3">
          {experiments.map((experiment, index) => {
            const stat = stats[index];
            return (
              <li key={experiment.id}>
                <Card className="transition-colors hover:border-primary/40">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))}
                        </span>
                        <Badge variant="neutral">{t.experiments.statusArchived}</Badge>
                      </div>
                      <p className="heading-serif text-base leading-relaxed text-foreground">
                        {experiment.question}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t.experiments.archivedAt}{' '}
                          <DateTime value={experiment.archivedAt ?? experiment.startedAt} mode="date" />
                        </span>
                        <span>
                          {t.experiments.duration}{' '}
                          {formatDurationFr(experiment.startedAt, experiment.archivedAt ?? new Date())}
                        </span>
                        <span>
                          {t.experiments.participants} : {stat?.participants ?? 0} ·{' '}
                          {t.common.plural(
                            stat?.aiMessages ?? 0,
                            t.common.message,
                            t.common.messages,
                          )}{' '}
                          ·{' '}
                          {t.common.plural(
                            stat?.expressionVersions ?? 0,
                            t.common.version,
                            t.common.versions,
                          )}
                        </span>
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-center">
                      <Link href={`/admin/experiences-precedentes/${experiment.id}`}>
                        {t.experiments.viewExperiment}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}