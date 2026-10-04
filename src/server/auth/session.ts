import 'server-only';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from '../env';
import { AppError } from '@/lib/errors';

export const SESSION_COOKIE = 'atelier_session';

export type SessionRole = 'admin' | 'student';

export interface SessionPayload {
  userId: string;
  username: string;
  role: SessionRole;
  /** Access epoch: a student session is only valid for the current epoch. */
  accessEpoch: number;
  /**
   * Student password version: a reset by the administrator increments it, which
   * immediately invalidates the sessions opened with the old password.
   * Always 0 for the administrator.
   */
  passwordVersion: number;
}

/**
 * Stateless, signed session stored in an HTTP-only cookie.
 * - Never readable from client JavaScript (HttpOnly)
 * - SameSite=Lax to protect against CSRF on state changing routes
 * - Secure in production
 * The student `accessEpoch` claim makes a global access switch instantly
 * revoke every existing student session.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = new TextEncoder().encode(env.authSecret);
  return new SignJWT({
    username: payload.username,
    role: payload.role,
    accessEpoch: payload.accessEpoch,
    passwordVersion: payload.passwordVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionMaxAgeSeconds}s`)
    .setIssuer('atelier-ecriture-ia')
    .setAudience('atelier-ecriture-ia-web')
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.authSecret);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'atelier-ecriture-ia',
      audience: 'atelier-ecriture-ia-web',
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'student')
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      accessEpoch: typeof payload.accessEpoch === 'number' ? payload.accessEpoch : 0,
      passwordVersion:
        typeof payload.passwordVersion === 'number' ? payload.passwordVersion : 0,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: env.sessionMaxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: 0,
  });
}

/** Reads the current session from the request cookies (never from the client). */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getTokenFromCookieHeader(
  cookieHeader: string | null,
): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return verifySessionToken(token);
}

/** Throws when no valid session exists. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AppError('UNAUTHORIZED');
  return session;
}