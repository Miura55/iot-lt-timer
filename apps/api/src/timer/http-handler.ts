import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { HttpError, getTimerState, startTimer } from './service.js';
import type { TimerRepository } from './repository.js';
import type { StepFunctionsWakeRegistrar } from './wake-registrar.js';

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
      throw new HttpError(404, 'NOT_FOUND');
    } catch (error) {
      const status = error instanceof HttpError ? error.statusCode : (error as { name?: string }).name === 'TransactionCanceledException' ? 409 : 503;
      const code = error instanceof HttpError ? error.code : status === 409 ? 'ACTIVE_SESSION' : 'UNAVAILABLE';
      return response(status, { code, message: error instanceof HttpError ? error.message : 'Request could not be completed.', requestId }, requestId);
    }
  };
}

function response(statusCode: number, body: unknown, requestId: string) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId }, body: JSON.stringify(body) };
}

export function principalFromEvent(event: APIGatewayProxyEventV2) { return getJwtClaims(event).sub as string | undefined; }

function getJwtClaims(event: APIGatewayProxyEventV2): Record<string, unknown> {
  return (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }).authorizer?.jwt?.claims ?? {};
}
