import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';

/** Entry point: redirects to the right workspace depending on the session. */
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');
  redirect(session.role === 'admin' ? '/admin' : '/etudiant');
}