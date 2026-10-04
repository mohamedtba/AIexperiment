import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { DatabaseOutageNotice } from '@/components/admin/database-outage-notice';
import { getSession } from '@/server/auth/session';
import { isDatabaseError } from '@/lib/errors';
import { adminRepository } from '@/server/db/repositories/accounts';

export const dynamic = 'force-dynamic';

/** Administration area: only the single administrator account can access it. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/connexion');
  if (session.role !== 'admin') redirect('/etudiant');

  // Resolve the account so that the interface never trusts a stale cookie value.
  // A database outage is a configuration problem: we show a French, actionable
  // screen instead of the framework error page. The session itself stays valid,
  // so the administrator keeps the shell and the access switch.
  let username = session.username;
  let databaseDown = false;
  try {
    const admin = await adminRepository.findById(session.userId);
    username = admin?.username ?? session.username;
  } catch (error) {
    if (!isDatabaseError(error)) throw error;
    databaseDown = true;
  }

  return (
    <AdminShell username={username}>
      {databaseDown ? <DatabaseOutageNotice /> : children}
    </AdminShell>
  );
}