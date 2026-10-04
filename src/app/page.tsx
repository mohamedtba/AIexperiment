import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { resolveSessionTarget } from '@/server/services/authService';

export const dynamic = 'force-dynamic';

/**
 * Entry point: sends the visitor to the right workspace.
 *
 * The destination is confirmed against the database, so a revoked cookie lands
 * on the login screen in a single hop instead of bouncing through a workspace
 * that would reject it.
 */
export default async function RootPage() {
  const session = await getSession();
  const target = session ? await resolveSessionTarget(session).catch(() => null) : null;
  redirect(target ?? '/connexion');
}