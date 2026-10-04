import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  Bot,
  FileText,
  MessagesSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AccessControl } from '@/components/admin/access-control';
import { StatCard } from '@/components/admin/stat-card';
import { ActivityFeed } from '@/components/admin/activity-feed';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/feedback';
import { RelativeTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr, formatDurationFr } from '@/lib/utils';
import { getAdminDashboard } from '@/server/services/adminService';

const t = getDictionary();

export const metadata: Metadata = { title: t.admin.dashboardTitle };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const data = await getAdminDashboard();
  const { access, experiment, stats, totalStudents, recentActivity } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.admin.dashboardTitle}
        subtitle={t.admin.dashboardSubtitle}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/experience">
              {t.nav.currentExperiment}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        }
      />

      {/* Accès des étudiants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            {t.admin.cardAccess}
          </CardTitle>
          <CardDescription>
            {access.studentAccessEnabled
              ? t.admin.accessEnabledAt
              : t.admin.accessDisabledAt}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessControl
            initialEnabled={access.studentAccessEnabled}
            updatedAtLabel={formatDateTimeFr(access.updatedAt)}
          />
        </CardContent>
      </Card>

      {/* Statistiques */}
      <section aria-label={t.admin.dashboardTitle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.admin.cardStudents}
          value={totalStudents}
          icon={Users}
          tone="neutral"
        />
        <StatCard
          label={t.admin.cardAIUsers}
          value={stats?.aiStudents ?? 0}
          hint={t.admin.cardAIUsersHint}
          icon={Bot}
          tone="ai"
        />
        <StatCard
          label={t.admin.cardExpressions}
          value={stats?.expressionVersions ?? 0}
          hint={t.admin.cardExpressionsHint}
          icon={FileText}
          tone="success"
        />
        <StatCard
          label={t.admin.experimentParticipants}
          value={stats?.participants ?? 0}
          hint={stats ? `${stats.aiMessages} messages IA` : undefined}
          icon={MessagesSquare}
          tone="primary"
        />
      </section>

      {/* Expérience active */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpenText className="h-4 w-4 text-primary" aria-hidden />
              {t.admin.cardActiveExperiment}
            </CardTitle>
            <CardDescription className="mt-1">
              {experiment
                ? `${t.experiments.startedAt} ${formatDateTimeFr(experiment.startedAt)} · ${t.experiments.duration} ${formatDurationFr(experiment.startedAt)}`
                : t.admin.dashboardSubtitle}
            </CardDescription>
          </div>
          {experiment ? <Badge variant="success">{t.experiments.statusActive}</Badge> : null}
        </CardHeader>
        <CardContent>
          {experiment ? (
            <div className="space-y-4">
              <blockquote className="heading-serif rounded-lg border-l-[3px] border-primary bg-muted/50 px-4 py-3 text-base leading-relaxed text-foreground sm:text-lg">
                {experiment.question}
              </blockquote>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {t.common.plural(stats?.participants ?? 0, t.common.student, t.common.students)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  {t.common.plural(stats?.aiMessages ?? 0, t.common.message, t.common.messages)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {t.common.plural(
                    stats?.expressionVersions ?? 0,
                    t.common.version,
                    t.common.versions,
                  )}
                </span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/experience">
                  {t.common.seeDetails}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyState
              icon={<BookOpenText className="h-6 w-6" />}
              title={t.admin.noExperimentTitle}
              description={t.admin.noExperimentBody}
              action={
                <Button asChild size="sm">
                  <Link href="/admin/experience">{t.admin.createFirstExperiment}</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Activité récente */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.recentActivity}</CardTitle>
          {experiment ? (
            <CardDescription>
              {t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))} ·{' '}
              <RelativeTime value={experiment.startedAt} />
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <ActivityFeed events={recentActivity} />
          ) : (
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title={t.admin.recentActivityEmpty}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t.common.appName} · {t.common.appTagline}
      </p>
    </div>
  );
}