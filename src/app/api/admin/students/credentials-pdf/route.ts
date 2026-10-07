import { createRouteHandler } from '@/lib/api';
import { credentialsPdfSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { buildCredentialsPdf } from '@/server/pdf/buildCredentialsPdf';

/** POST /api/admin/students/credentials-pdf — PDF of just-created accounts. */
export const POST = createRouteHandler({
  body: credentialsPdfSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const pdf = await buildCredentialsPdf(input.accounts);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': 'attachment; filename="identifiants.pdf"',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
});
