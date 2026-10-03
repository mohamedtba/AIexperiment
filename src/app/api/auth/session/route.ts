import { createRouteHandler, jsonOk } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { getAccessSettings } from '@/server/services/accessService';

/**
 * GET /api/auth/session
 * Used by the student interface to detect instantly that the session has been
 * revoked by the administrator (access switch OFF) or that an experiment ended.
 */
export const GET = createRouteHandler({
  handler: async () => {
    const session = await getSession();
    if (!session) return jsonOk({ authenticated: false });

    const access = await getAccessSettings();
    const valid =
      session.role === 'admin' ||
      (access.studentAccessEnabled && session.accessEpoch === access.accessEpoch);

    return jsonOk({
      authenticated: true,
      role: session.role,
      username: session.username,
      valid,
      studentAccessEnabled: access.studentAccessEnabled,
    });
  },
});