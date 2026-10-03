import 'server-only';

import bcrypt from 'bcryptjs';

const ADMIN_ROUNDS = 12;
const STUDENT_ROUNDS = 10;

/** Passwords are never stored in clear text, only as bcrypt hashes. */
export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ADMIN_ROUNDS);
}

export async function hashStudentPassword(password: string): Promise<string> {
  return bcrypt.hash(password, STUDENT_ROUNDS);
}

/** Constant-time friendly comparison: bcrypt always hashes the candidate. */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}