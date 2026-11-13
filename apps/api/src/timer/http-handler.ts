import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { HttpError, controlTimer, getTimerState, startTimer } from './service.js';
import type { TimerRepository } from './repository.js';
import type { StepFunctionsWakeRegistrar } from './wake-registrar.js';
import { operationEvent } from './observability.js';

export function createHttpHandler(repository: TimerRepository, registrar: StepFunctionsWakeRegistrar, venueId: string, authConfig: { userPoolId: string; userPoolClientId: string }): APIGatewayProxyHandlerV2 {
  return async (event: APIGatewayProxyEventV2) => {
    const requestId = event.requestContext.requestId;
    try {
      if (event.requestContext.http.method === 'GET' && event.rawPath === '/v1/config') return response(200, authConfig, requestId);
      const principalId = getJwtClaims(event).sub;
      if (typeof principalId !== 'string' || !principalId) throw new HttpError(401, 'UNAUTHENTICATED');
      const method = event.requestContext.http.method;
      if (method === 'GET' && event.rawPath === '/v1/state') {
        if (!(await repository.getGrant(principalId, venueId, 'read'))) throw new HttpError(403, 'FORBIDDEN');
        return response(200, await getTimerState(repository, venueId), requestId);
      }
      if (method === 'POST' && event.rawPath === '/v1/sessions') {
        const key = event.headers['idempotency-key'] ?? event.headers['Idempotency-Key'];
        if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be a UUID');
        let input: unknown;
        try { input = JSON.parse(event.body ?? ''); } catch { throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be JSON'); }
        const result = await startTimer({ repository, registrar, principalId, idempotencyKey: key, input, config: { venueId } });
        return response(result.statusCode, result.body, requestId);
      }
      const controlMatch = method === 'POST' ? /^\/v1\/sessions\/([^/]+)\/(pause|resume|cancel)$/.exec(event.rawPath) : null;
      if (controlMatch) {
        const key = event.headers['idempotency-key'] ?? event.headers['Idempotency-Key'];
        if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be a UUID');
        let input: unknown;
        try { input = JSON.parse(event.body ?? ''); } catch { throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be JSON'); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Number.isSafeInteger((input as Record<string, unknown>).expectedVersion) || (input as Record<string, unknown>).expectedVersion as number < 1) throw new HttpError(400, 'VALIDATION_ERROR', 'expectedVersion must be a positive integer');
        const [, sessionId, action] = controlMatch;
        const result = await controlTimer({ repository, registrar, principalId, sessionId: decodeURIComponent(sessionId!), route: `POST#/v1/sessions/{sessionId}/${action}` as 'POST#/v1/sessions/{sessionId}/pause', idempotencyKey: key, expectedVersion: (input as { expectedVersion: number }).expectedVersion, venueId, requestId });
        if (result.statusCode >= 400) {
          const code = (result.body as { code?: string })?.code ?? 'UNAVAILABLE';
          return response(result.statusCode, { code, message: code === 'IN_PROGRESS' ? 'The operation is still being resolved.' : 'The timer operation could not be completed.', requestId }, requestId);
        }
        return response(result.statusCode, result.body, requestId);
      }
      throw new HttpError(404, 'NOT_FOUND');
    } catch (error) {
      const status = error instanceof HttpError ? error.statusCode : (error as { name?: string }).name === 'TransactionCanceledException' ? 409 : 503;
      const code = error instanceof HttpError ? error.code : status === 409 ? 'ACTIVE_SESSION' : 'UNAVAILABLE';
      const controlMatch = /^\/v1\/sessions\/([^/]+)\/(pause|resume|cancel)$/.exec(event.rawPath);
      if (controlMatch) operationEvent({ event: 'timer-control-rejected', operation: controlMatch[2] as 'pause' | 'resume' | 'cancel', result: code === 'FORBIDDEN' ? 'forbidden' : status === 409 ? 'conflict' : 'rejected', sessionId: decodeURIComponent(controlMatch[1]!), requestId, timestamp: new Date() });
      return response(status, { code, message: error instanceof HttpError ? error.message : 'Request could not be completed.', requestId }, requestId);
    }
  };
}

function response(statusCode: number, body: unknown, requestId: string) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId, ...(statusCode === 409 && (body as { code?: string })?.code === 'IN_PROGRESS' ? { 'retry-after': '1' } : {}) }, body: JSON.stringify(body) };
}

export function principalFromEvent(event: APIGatewayProxyEventV2) { return getJwtClaims(event).sub as string | undefined; }

function getJwtClaims(event: APIGatewayProxyEventV2): Record<string, unknown> {
  return (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }).authorizer?.jwt?.claims ?? {};
}
