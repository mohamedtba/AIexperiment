import { createRouteHandler, jsonOk } from '@/lib/api';
import { ERROR_MESSAGES } from '@/lib/errors';
import { getAccessSettings } from '@/server/services/accessService';
import { getCurrentExperiment } from '@/server/services/experimentService';

/**
 * GET /api/system/status — public status used by the login screen.
 *
 * `database` tells the login page whether a deployment problem (bad
 * `DATABASE_URL`, wrong Mongo credentials, IP not allowed…) prevents any
 * connection, which is very different from "student access is suspended".
 */
export const GET = createRouteHandler({
  handler: async () => {
    try {
      const [access, experiment] = await Promise.all([
        getAccessSettings(),
        getCurrentExperiment(),
      ]);
      return jsonOk({
        status: 'ok',
        database: 'ok',
        studentAccessEnabled: access.studentAccessEnabled,
        hasActiveExperiment: Boolean(experiment),
      });
    } catch {
      return jsonOk({
        status: 'degraded',
        database: 'error',
        message: ERROR_MESSAGES.DATABASE_UNAVAILABLE,
        // Unknown: null avoids showing a misleading "access suspended" banner.
        studentAccessEnabled: null,
        hasActiveExperiment: null,
      });
    }
  },
});