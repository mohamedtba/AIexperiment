import 'server-only';

import { randomInt } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { studentRepository } from '../db/repositories/accounts';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const MAX_ATTEMPTS = 25;

export interface StudentCredentials {
  username: string;
  password: string;
}

/** Cryptographically random 6 lowercase letters (student identity). */
export function generateUsername(): string {
  let username = '';
  for (let index = 0; index < 6; index += 1) {
    username += LOWERCASE[randomInt(0, LOWERCASE.length)];
  }
  return username;
}

/** Cryptographically random 4 digits password. */
export function generatePassword(): string {
  let password = '';
  for (let index = 0; index < 4; index += 1) {
    password += DIGITS[randomInt(0, DIGITS.length)];
  }
  return password;
}

/**
 * Generates credentials and verifies the username does not already exist.
 * The unique index on `students.username` is the last line of defence.
 */
export async function generateCredentials(): Promise<StudentCredentials> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const username = generateUsername();
    const exists = await studentRepository.existsByUsername(username);
    if (!exists) {
      return { username, password: generatePassword() };
    }
  }
  throw new AppError('SERVER_ERROR', 500);
}