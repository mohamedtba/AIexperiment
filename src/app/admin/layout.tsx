import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { getSession } from '@/server/auth/session';
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
  const admin = await adminRepository.findById(session.userId);
  const username = admin?.username ?? session.username;

  return <AdminShell username={username}>{children}</AdminShell>;
}