import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { AppError, toErrorResponse, zodIssueMessage } from './errors';

type Handler<Input, C> = (
  request: Request,
  context: C,
  input: Input,
) => Promise<Response> | Response;

interface RouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Wraps an API route handler: validates JSON input when a schema is provided,
 * converts thrown errors into French JSON responses and disables caching.
 */
export function createRouteHandler<Input = undefined, C = RouteContext>(
  options: { body?: ZodSchema<Input>; handler: Handler<Input, C> },
) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      let body: Input | undefined;
      if (options.body) {
        body = await parseJsonBody(request, options.body);
      }
      const response = await options.handler(request, context, body as Input);
      return withNoStore(response);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return withNoStore(NextResponse.json(body, { status }));
    }
  };
}

async function parseJsonBody<Input>(
  request: Request,
  schema: ZodSchema<Input>,
): Promise<Input> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 400);
  }
  try {
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      // Forward the schema wording (always French) instead of a generic message.
      throw new AppError('VALIDATION_ERROR', 400, zodIssueMessage(error));
    }
    throw error;
  }
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonOk<T>(data: T, init?: { status?: number }): NextResponse<T> {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}