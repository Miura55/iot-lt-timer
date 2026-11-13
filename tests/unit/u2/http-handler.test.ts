import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHttpHandler } from '../../../apps/api/src/timer/http-handler.js';

function event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return { version: '2.0', routeKey: 'POST /v1/sessions/s-1/pause', rawPath: '/v1/sessions/s-1/pause', rawQueryString: '', headers: { 'idempotency-key': '123e4567-e89b-12d3-a456-426614174000' }, requestContext: { accountId: 'a', apiId: 'a', domainName: 'a', domainPrefix: 'a', http: { method: 'POST', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' }, requestId: 'req', routeKey: 'POST /v1/sessions/s-1/pause', stage: '$default', time: '', timeEpoch: 0, authorizer: { jwt: { claims: { sub: 'operator' }, scopes: [] } } } as never, body: JSON.stringify({ expectedVersion: 3 }), isBase64Encoded: false, ...overrides };
}
const registrar = { register: vi.fn() };
const auth = { userPoolId: 'pool', userPoolClientId: 'client' };

describe('U2 HTTP control routes', () => {
  it('requires a valid JSON body and positive expectedVersion', async () => {
    const repository = { getGrant: vi.fn() };
    const handler = createHttpHandler(repository as never, registrar as never, 'venue', auth);
    const response = await handler(event({ body: '{"expectedVersion":0}' }));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!)).toMatchObject({ code: 'VALIDATION_ERROR', requestId: 'req' });
    expect(repository.getGrant).not.toHaveBeenCalled();
  });
  it('rejects missing JWT subject before looking up venue permissions', async () => {
    const repository = { getGrant: vi.fn() };
    const noSubject = event({ requestContext: { ...event().requestContext, authorizer: { jwt: { claims: {}, scopes: [] } } } as never });
    const response = await createHttpHandler(repository as never, registrar as never, 'venue', auth)(noSubject);
    expect(response.statusCode).toBe(401);
    expect(repository.getGrant).not.toHaveBeenCalled();
  });
  it('enforces operate permission and returns the service control result', async () => {
    const repository = { getGrant: vi.fn().mockResolvedValue(false) };
    const response = await createHttpHandler(repository as never, registrar as never, 'venue', auth)(event());
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('maps pause resume and cancel paths to the control operation', async () => {
    const repository = { getGrant: vi.fn().mockResolvedValue(true), findIdempotent: vi.fn().mockResolvedValue({ response: { ok: true }, statusCode: 200 }) };
    const handler = createHttpHandler(repository as never, registrar as never, 'venue', auth);
    for (const action of ['pause', 'resume', 'cancel']) {
      const response = await handler(event({ rawPath: `/v1/sessions/s-1/${action}` }));
      expect(response.statusCode).toBe(200);
    }
    expect(repository.findIdempotent).toHaveBeenCalledTimes(3);
  });
  it('returns C1 IN_PROGRESS with Retry-After for an unresolved idempotency receipt', async () => {
    const repository = { getGrant: vi.fn().mockResolvedValue(true), findIdempotent: vi.fn().mockResolvedValue({ response: undefined, statusCode: 409 }) };
    const response = await createHttpHandler(repository as never, registrar as never, 'venue', auth)(event());
    expect(response.statusCode).toBe(409);
    expect(response.headers?.['retry-after']).toBe('1');
    expect(JSON.parse(response.body!)).toMatchObject({ code: 'IN_PROGRESS', message: 'The operation is still being resolved.', requestId: 'req' });
  });
  it('rejects malformed idempotency keys', async () => {
    const repository = { getGrant: vi.fn() };
    const response = await createHttpHandler(repository as never, registrar as never, 'venue', auth)(event({ headers: { 'idempotency-key': 'bad' } }));
    expect(response.statusCode).toBe(400);
  });
});
