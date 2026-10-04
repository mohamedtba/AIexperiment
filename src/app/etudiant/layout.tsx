import { redirect } from 'next/navigation';
import { StudentShell } from '@/components/student/student-shell';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';
import { getSession } from '@/server/auth/session';
import { getAccessSettings } from '@/server/services/accessService';
import { isStudentSessionCurrent } from '@/server/services/authService';

const t = getDictionary();

export const dynamic = 'force-dynamic';

/**
 * Student area.
 *
 * The global access switch and the session epoch are checked on the server:
 *  - access suspended by the administrator → suspension screen, data preserved;
 *  - session revoked (epoch mismatch)     → back to the login screen;
 *  - password reset by the administrator  → back to the login screen.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/connexion');
  if (session.role === 'admin') redirect('/admin');

  const access = await getAccessSettings().catch(() => null);

  // Database unreachable: we cannot decide, so we show a neutral retry screen
  // instead of logging the student out.
  if (!access) {
    return (
      <StudentShell username={session.username}>
        <Card className="mt-6">
          <CardContent className="pt-5 sm:pt-6">
            <EmptyState
              title={t.student.serviceUnavailableTitle}
              description={t.student.serviceUnavailableBody}
              action={
                <Button asChild variant="outline" size="sm">
                  <a href="/etudiant">{t.common.retry}</a>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </StudentShell>
    );
  }

  if (!access.studentAccessEnabled) {
    redirect('/acces-suspendu');
  }

  if (session.accessEpoch !== access.accessEpoch) {
    redirect('/connexion');
  }

  // The administrator reset this student's password: the session opened with the
  // previous one is revoked.
  const sessionCurrent = await isStudentSessionCurrent(
    session.userId,
    session.passwordVersion,
  ).catch(() => true);
  if (!sessionCurrent) {
    redirect('/connexion');
  }

  return <StudentShell username={session.username}>{children}</StudentShell>;
}