import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PauseCircle } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { getSession } from '@/server/auth/session';
import { getAccessSettings } from '@/server/services/accessService';

const t = getDictionary();

export const metadata: Metadata = {
  title: t.auth.accessSuspendedTitle,
};

export const dynamic = 'force-dynamic';

/**
 * Screen displayed when the administrator suspends student access.
 * Data is preserved: no message, no writing and no account is ever deleted.
 */
export default async function SuspendedAccessPage() {
  const session = await getSession();
  const access = await getAccessSettings().catch(() => null);

  if (!session) redirect('/connexion');
  if (session.role === 'admin') redirect('/admin');
  // The student can come back only when access is open again with a valid session.
  if (access?.studentAccessEnabled && session.accessEpoch === access.accessEpoch) {
    redirect('/etudiant');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg text-center">
        <div className="card-surface p-6 sm:p-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <PauseCircle className="h-7 w-7" aria-hidden />
          </div>

          <h1 className="text-xl font-semibold tracking-tight">
            {t.auth.accessSuspendedTitle}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-foreground">
            {t.auth.accessSuspendedBody}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t.auth.accessSuspendedHint}
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <LogoutButton
              label={t.auth.accessSuspendedAction}
              variant="default"
              size="default"
              className="sm:w-auto"
            />
            <Button asChild variant="outline" size="default">
              <Link href="/connexion">{t.auth.goToLogin}</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}