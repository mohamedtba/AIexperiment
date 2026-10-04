import 'server-only';

import { AppError } from '@/lib/errors';
import { env } from '../env';
import { adminRepository, studentRepository } from '../db/repositories/accounts';
import { hashStudentPassword, verifyPassword } from '../auth/password';
import { clientIp, rateLimit } from '../auth/rate-limit';
import { getAccessSettings } from './accessService';
import { generateCredentials, generatePassword } from './credentials';
import type { SessionPayload } from '../auth/session';
import type { AdminPublic, StudentPublic } from '@/types';

export interface StudentLoginResult {
  student: StudentPublic;
  accessEpoch: number;
  passwordVersion: number;
}

export interface AdminLoginResult {
  admin: AdminPublic;
}

/** Student login: rate limited, access switch enforced, password verified. */
export async function loginStudent(
  input: { username: string; password: string },
  request: Request,
): Promise<StudentLoginResult> {
  const ip = clientIp(request);
  const attempts = env.loginAttemptsPerMinute;
  const limit = rateLimit(`login:student:${ip}`, attempts, 60_000);
  if (!limit.allowed) throw new AppError('LOGIN_RATE_LIMIT', 429);

  const access = await getAccessSettings();
  if (!access.studentAccessEnabled) {
    throw new AppError('STUDENT_ACCESS_DISABLED', 403);
  }

  const student = await studentRepository.findByUsername(input.username);
  const passwordHash = student?.password_hash ?? DUMMY_HASH;

  const valid = await verifyPassword(input.password, passwordHash);
  if (!student || !valid) throw new AppError('INVALID_CREDENTIALS', 401);

  await studentRepository.touchLastLogin(student.id);

  return {
    student: {
      id: student.id,
      username: student.username,
      createdAt: student.created_at,
      lastLoginAt: new Date(),
    },
    accessEpoch: access.accessEpoch,
    passwordVersion: student.password_version ?? 1,
  };
}

/**
 * Generates a new 4-digit password for a student. The plaintext password is
 * returned once to the administrator and never stored in clear.
 * Incrementing `passwordVersion` immediately revokes the sessions that were
 * opened with the previous password.
 */
export async function resetStudentPassword(studentId: string): Promise<{
  username: string;
  password: string;
}> {
  const student = await studentRepository.findAuthById(studentId);
  if (!student) throw new AppError('STUDENT_NOT_FOUND');

  const password = generatePassword();
  await studentRepository.resetPassword(studentId, await hashStudentPassword(password));

  return { username: student.username, password };
}

/** A student session is only current while the password version matches. */
export async function isStudentSessionCurrent(
  studentId: string,
  passwordVersion: number,
): Promise<boolean> {
  const stored = await studentRepository.getPasswordVersion(studentId);
  return stored !== null && stored === passwordVersion;
}

/**
 * Authoritative landing page for an already signed session cookie.
 *
 * A JWT stays cryptographically valid for its whole lifetime, even after the
 * database has invalidated what it describes: deleted account, password reset
 * by the administrator, access epoch bumped. The edge middleware has no
 * database access, so it cannot tell the difference — this function is the
 * single source of truth used by `/` and `/connexion` to decide whether a
 * visitor may be sent straight to their workspace.
 *
 * Returning `null` means "show the login screen". That is always safe: the
 * caller renders a form instead of redirecting, so no redirect cycle can form.
 */
export async function resolveSessionTarget(
  session: SessionPayload,
): Promise<'/admin' | '/etudiant' | null> {
  if (session.role === 'admin') {
    // The interface never trusts a stale cookie value for the displayed name.
    const admin = await adminRepository.findById(session.userId).catch(() => null);
    return admin ? '/admin' : null;
  }

  // Database unreachable: we cannot decide, so we do not redirect at all.
  const access = await getAccessSettings().catch(() => null);
  if (!access) return null;

  // Global access switch, or a reset of this very student's password.
  if (session.accessEpoch !== access.accessEpoch) return null;

  const current = await isStudentSessionCurrent(
    session.userId,
    session.passwordVersion,
  ).catch(() => false);
  return current ? '/etudiant' : null;
}

/** Administrator login (single account, no registration). */
export async function loginAdmin(
  input: { username: string; password: string },
  request: Request,
): Promise<AdminLoginResult> {
  const ip = clientIp(request);
  const attempts = env.loginAttemptsPerMinute;
  const limit = rateLimit(`login:admin:${ip}`, attempts, 60_000);
  if (!limit.allowed) throw new AppError('LOGIN_RATE_LIMIT', 429);

  const admin = await adminRepository.findByUsername(input.username);
  if (!admin) {
    if ((await adminRepository.count()) === 0) {
      throw new AppError('ADMIN_NOT_CONFIGURED', 401);
    }
    throw new AppError('INVALID_CREDENTIALS', 401);
  }

  const valid = await verifyPassword(input.password, admin.password_hash);
  if (!valid) throw new AppError('INVALID_CREDENTIALS', 401);

  await adminRepository.touchLastLogin(admin.id);

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      createdAt: admin.created_at,
      lastLoginAt: new Date(),
    },
  };
}

/** Creates a student account with a guaranteed unique username + password. */
export async function createStudentAccount(): Promise<{
  student: StudentPublic;
  password: string;
}> {
  const credentials = await generateCredentials();
  const passwordHash = await hashStudentPassword(credentials.password);
  const student = await studentRepository.insert(credentials.username, passwordHash);
  return { student, password: credentials.password };
}

/**
 * A bcrypt hash of a random value, used to keep the response time of a login
 * attempt constant whether the account exists or not.
 */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';