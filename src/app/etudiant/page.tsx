import type { Metadata } from 'next';
import { Clock } from 'lucide-react';
import { StudentWorkspace } from '@/components/student/student-workspace';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';
import { getSession } from '@/server/auth/session';
import { getStudentWorkspace } from '@/server/services/studentExperienceService';

const t = getDictionary();

export const metadata: Metadata = { title: t.student.dashboardTitle };
export const dynamic = 'force-dynamic';

export default async function StudentPage() {
  const session = await getSession();
  const workspace = await getStudentWorkspace(session?.userId ?? '').catch(() => null);

  if (!workspace) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-5 sm:pt-6">
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title={t.student.noExperimentTitle}
            description={t.student.noExperimentBody}
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