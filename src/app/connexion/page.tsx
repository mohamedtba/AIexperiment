import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getDictionary } from '@/i18n';
import { getSession } from '@/server/auth/session';
import { resolveSessionTarget } from '@/server/services/authService';

const t = getDictionary();

export const metadata: Metadata = {
  title: t.auth.loginTitle,
};

export const dynamic = 'force-dynamic';

/**
 * Login screen.
 *
 * A visitor who still owns a usable session is sent straight to their
 * workspace, but only after the database has confirmed it. A cookie that is
 * signed yet revoked (password reset, epoch change, deleted account) lands
 * here and shows the form, instead of being bounced between two pages forever.
 */
export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    const target = await resolveSessionTarget(session).catch(() => null);
    if (target) redirect(target);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <LoginForm />
    </main>
  );
}