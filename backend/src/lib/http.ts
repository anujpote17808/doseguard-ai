import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
  name?: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function logger(level: 'INFO' | 'WARN' | 'ERROR', eventName: string, meta: Record<string, unknown> = {}): void {
  const safeMeta = { ...meta };
  // Never log raw secrets or tokens
  delete safeMeta.passcode;
  delete safeMeta.token;
  delete safeMeta.authorization;

  const entry = {
    timestamp: new Date().toISOString(),
    service: 'doseguard-ai-backend',
    level,
    event: eventName,
    ...safeMeta,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export function extractAuthPrincipal(event: APIGatewayProxyEventV2): AuthenticatedPrincipal {
  const authorizer = (event.requestContext as unknown as {
    authorizer?: {
      jwt?: {
        claims?: Record<string, string | undefined>;
      };
    };
  })?.authorizer;

  const claims = authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (!sub || typeof sub !== 'string' || sub.trim().length === 0) {
    throw new AppError(401, 'UNAUTHORIZED', 'Valid Cognito authentication token is required.');
  }

  return {
    userId: sub,
    email: claims?.email || claims?.['cognito:username'] || 'user@doseguard.local',
    name: claims?.name || claims?.given_name,
  };
}

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

export function handleError(err: unknown, requestId?: string): APIGatewayProxyStructuredResultV2 {
  if (err instanceof AppError) {
    logger('WARN', 'API_CLIENT_ERROR', {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      requestId,
    });
    return jsonResponse(err.statusCode, {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
    const zodErr = err as unknown as { issues: unknown[] };
    return jsonResponse(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed.',
        details: zodErr.issues,
      },
    });
  }

  logger('ERROR', 'UNHANDLED_EXCEPTION', {
    errorName: err instanceof Error ? err.name : 'UnknownError',
    errorMessage: err instanceof Error ? err.message : String(err),
    requestId,
  });

  return jsonResponse(500, {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred while processing the request.',
    },
  });
}

export function parseJsonBody<T>(body: string | undefined): T {
  if (!body) {
    return {} as T;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

