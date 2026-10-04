import 'server-only';

import { AppError } from '@/lib/errors';
import { adminRepository, studentRepository } from '../db/repositories/accounts';
import { hashStudentPassword, verifyPassword } from '../auth/password';
import { clientIp, rateLimit } from '../auth/rate-limit';
import { getAccessSettings } from './accessService';
import { generateCredentials, generatePassword } from './credentials';
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
  const limit = rateLimit(`login:student:${ip}`, 12, 60_000);
  if (!limit.allowed) throw new AppError('LOGIN_RATE_LIMIT', 429);

  const access = await getAccessSettings();
  if (!access.studentAccessEnabled) {
    throw new AppError('STUDENT_ACCESS_DISABLED', 403);
  }

  const student = await studentRepository.findByUsername(input.username);
  const passwordHash = student?.passwordHash ?? DUMMY_HASH;

  const valid = await verifyPassword(input.password, passwordHash);
  if (!student || !valid) throw new AppError('INVALID_CREDENTIALS', 401);

  await studentRepository.touchLastLogin(student._id.toHexString());

  return {
    student: {
      id: student._id.toHexString(),
      username: student.username,
      createdAt: student.createdAt,
      lastLoginAt: new Date(),
    },
    accessEpoch: access.accessEpoch,
    passwordVersion: student.passwordVersion ?? 1,
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

/** Administrator login (single account, no registration). */
export async function loginAdmin(
  input: { username: string; password: string },
  request: Request,
): Promise<AdminLoginResult> {
  const ip = clientIp(request);
  const limit = rateLimit(`login:admin:${ip}`, 8, 60_000);
  if (!limit.allowed) throw new AppError('LOGIN_RATE_LIMIT', 429);

  const admin = await adminRepository.findByUsername(input.username);
  if (!admin) {
    if ((await adminRepository.count()) === 0) {
      throw new AppError('ADMIN_NOT_CONFIGURED', 401);
    }
    throw new AppError('INVALID_CREDENTIALS', 401);
  }

  const valid = await verifyPassword(input.password, admin.passwordHash);
  if (!valid) throw new AppError('INVALID_CREDENTIALS', 401);

  await adminRepository.touchLastLogin(admin._id.toHexString());

  return {
    admin: {
      id: admin._id.toHexString(),
      username: admin.username,
      createdAt: admin.createdAt,
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