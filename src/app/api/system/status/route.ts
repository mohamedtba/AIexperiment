import { createRouteHandler, jsonOk } from '@/lib/api';
import { getAccessSettings } from '@/server/services/accessService';
import { getCurrentExperiment } from '@/server/services/experimentService';

/** GET /api/system/status — public status used by the login screen. */
export const GET = createRouteHandler({
  handler: async () => {
    try {
      const [access, experiment] = await Promise.all([
        getAccessSettings(),
        getCurrentExperiment(),
      ]);
      return jsonOk({
        status: 'ok',
        studentAccessEnabled: access.studentAccessEnabled,
        hasActiveExperiment: Boolean(experiment),
      });
    } catch {
      return jsonOk({ status: 'degraded', studentAccessEnabled: false, hasActiveExperiment: false });
    }
  },
});