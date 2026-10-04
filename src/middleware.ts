import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'atelier_session';
const AUTH_SECRET = process.env.AUTH_SECRET;

type Role = 'admin' | 'student';

interface TokenPayload {
  sub?: string;
  username?: string;
  role?: Role;
}

/**
 * Edge guard (defense in depth).
 *
 * It only reads and verifies the signed session cookie: no database access is
 * possible here. Real authorization (access switch, epoch, ownership) is
 * enforced in the server layouts, pages and API routes.
 *
 * For the same reason it never redirects `/connexion`: it can confirm that a
 * cookie is authentic but not that the session it describes still exists, and
 * a guess would create a redirect loop with the server-side check.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith('/admin');
  const isStudentRoute = pathname.startsWith('/etudiant');
  const isAuthRoute = pathname === '/connexion' || pathname === '/acces-suspendu';

  if (!isAdminRoute && !isStudentRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token && AUTH_SECRET ? await verifyToken(token) : null;

  if (!session?.sub || !session.role) {
    if (isAuthRoute) return NextResponse.next();
    return NextResponse.redirect(new URL('/connexion', request.url));
  }

  // Students must never reach the administration area.
  if (isAdminRoute && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/etudiant', request.url));
  }
  if (isStudentRoute && session.role !== 'student') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // `/connexion` is deliberately NOT redirected from here. A signature that is
  // still valid can describe a session the database has already revoked (reset
  // password, bumped epoch, deleted account). The server, which can read the
  // database, decides on `/connexion` itself: bouncing here would trap revoked
  // users in an endless /connexion <-> workspace redirect loop.
  return NextResponse.next();
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'atelier-ecriture-ia',
      audience: 'atelier-ecriture-ia-web',
      algorithms: ['HS256'],
    });
    if (payload.role !== 'admin' && payload.role !== 'student') return null;
    return {
      sub: payload.sub,
      username: typeof payload.username === 'string' ? payload.username : undefined,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export const config = {
  matcher: ['/admin/:path*', '/etudiant/:path*', '/connexion', '/acces-suspendu'],
};