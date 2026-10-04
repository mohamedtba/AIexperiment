import type { Metadata } from 'next';
import { Clock } from 'lucide-react';
import { StudentWorkspace } from '@/components/student/student-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';
import { getSession } from '@/server/auth/session';
import { getStudentWorkspace } from '@/server/services/studentExperienceService';
import { hasAnyExperiment } from '@/server/services/experimentService';

const t = getDictionary();

export const metadata: Metadata = { title: t.student.dashboardTitle };
export const dynamic = 'force-dynamic';

export default async function StudentPage() {
  const session = await getSession();
  const workspace = await getStudentWorkspace(session?.userId ?? '').catch(() => null);

  if (!workspace) {
    // "Not started yet" and "stopped by the administrator" are different
    // situations for the student, so they must not read the same sentence.
    const everStarted = await hasAnyExperiment().catch(() => false);

    return (
      <Card className="mt-6">
        <CardContent className="pt-5 sm:pt-6">
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title={
              everStarted ? t.student.experimentStoppedTitle : t.student.noExperimentTitle
            }
            description={
              everStarted ? t.student.experimentStoppedBody : t.student.noExperimentBody
            }
            action={
              <Button asChild variant="outline" size="sm">
                <a href="/etudiant">{t.common.retry}</a>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <StudentWorkspace
      experiment={{
        id: workspace.experiment.id,
        sequence: workspace.experiment.sequence,
        question: workspace.experiment.question,
        startedAt: workspace.experiment.startedAt.toISOString(),
      }}
      initialMessages={workspace.messages}
      initialVersions={workspace.versions}
    />
  );
}