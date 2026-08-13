import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuthGatewayService } from './auth-gateway.service';

describe('AuthGatewayService', () => {
  function makeService(clientSend: jest.Mock) {
    const client = { send: clientSend } as any;
    return new AuthGatewayService(client);
  }

  it('resolves with the microservice response on success', async () => {
    const service = makeService(jest.fn().mockReturnValue(of({ ok: true })));
    await expect(service.send('some.pattern', {})).resolves.toEqual({ ok: true });
  });

  it('converts an RpcException payload into an HttpException with a proper {statusCode, message} JSON body', async () => {
    // This is the exact shape an RpcException takes once it crosses the TCP
    // boundary and lands in the gateway's catchError: `{ error, message }`,
    // where `.error` holds the original { statusCode, message } payload.
    const rpcError = { error: { statusCode: 401, message: 'Invalid email or password' }, message: 'Invalid email or password' };
    const service = makeService(jest.fn().mockReturnValue(throwError(() => rpcError)));

    await expect(service.send('auth.login', {})).rejects.toMatchObject({
      status: 401,
      response: { statusCode: 401, message: 'Invalid email or password' },
    });
  });

  it('never lets an HttpException response body degrade into a bare string', async () => {
    const rpcError = { error: { statusCode: 409, message: 'An account with this email already exists' } };
    const service = makeService(jest.fn().mockReturnValue(throwError(() => rpcError)));

    try {
      await service.send('auth.register', {});
      throw new Error('expected send() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse();
      expect(typeof response).toBe('object');
      expect(response).toMatchObject({ statusCode: 409, message: 'An account with this email already exists' });
    }
  });

  it('falls back to a 503 when the error is not a recognizable RPC payload (e.g. the microservice is down)', async () => {
    const service = makeService(jest.fn().mockReturnValue(throwError(() => new Error('connection refused'))));

    await expect(service.send('auth.login', {})).rejects.toMatchObject({ status: 503 });
  });
});
