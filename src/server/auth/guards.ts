import 'server-only';

import { AppError } from '@/lib/errors';
import { getSession, type SessionPayload } from './session';
import { getAccessSettings } from '../services/accessService';

export interface AuthenticatedStudent {
  studentId: string;
  username: string;
  session: SessionPayload;
}

export interface AuthenticatedAdmin {
  adminId: string;
  username: string;
  session: SessionPayload;
}

/** Server-side authorization: the identity always comes from the session cookie,
 *  never from the request body or query string. */
export async function requireAdmin(): Promise<AuthenticatedAdmin> {
  const session = await getSession();
  if (!session) throw new AppError('UNAUTHORIZED');
  if (session.role !== 'admin') throw new AppError('FORBIDDEN', 403);
  return { adminId: session.userId, username: session.username, session };
}

/** Server-side authorization for students, including the global access switch
 *  and the session epoch (instant revocation when access is turned OFF). */
export async function requireStudent(): Promise<AuthenticatedStudent> {
  const session = await getSession();
  if (!session) throw new AppError('UNAUTHORIZED');
  if (session.role !== 'student') throw new AppError('FORBIDDEN', 403);

  const access = await getAccessSettings();
  if (!access.studentAccessEnabled) {
    throw new AppError('STUDENT_ACCESS_DISABLED', 403);
  }
  if (session.accessEpoch !== access.accessEpoch) {
    throw new AppError('SESSION_EXPIRED', 401);
  }

  return { studentId: session.userId, username: session.username, session };
}