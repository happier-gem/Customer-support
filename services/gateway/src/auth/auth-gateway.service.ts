import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';
import { AUTH_SERVICE_CLIENT, RpcErrorPayload } from '@app/shared';

const CALL_TIMEOUT_MS = 8000;

function isRpcErrorPayload(err: unknown): err is RpcErrorPayload {
  return typeof err === 'object' && err !== null && 'statusCode' in err && 'message' in err;
}

/**
 * Errors crossing the TCP boundary arrive wrapped the way RpcException
 * itself is shaped: `{ error: <payload we threw>, message: <string> }`.
 * Unwrap `.error` to get back the { statusCode, message } we sent.
 */
function extractRpcErrorPayload(err: unknown): RpcErrorPayload | null {
  if (isRpcErrorPayload(err)) return err;
  if (typeof err === 'object' && err !== null && 'error' in err) {
    const inner = (err as { error: unknown }).error;
    if (isRpcErrorPayload(inner)) return inner;
  }
  return null;
}

@Injectable()
export class AuthGatewayService {
  constructor(@Inject(AUTH_SERVICE_CLIENT) private readonly client: ClientProxy) {}

  send<TResult = unknown>(pattern: string, payload: unknown): Promise<TResult> {
    return firstValueFrom(
      this.client.send<TResult>(pattern, payload ?? {}).pipe(
        timeout(CALL_TIMEOUT_MS),
        catchError((err) => {
          const payload = extractRpcErrorPayload(err);
          if (payload) {
            return throwError(
              () =>
                new HttpException(
                  {
                    statusCode: payload.statusCode,
                    message: payload.message,
                    ...(payload.code ? { code: payload.code } : {}),
                    ...(payload.data ? { data: payload.data } : {}),
                  },
                  payload.statusCode,
                ),
            );
          }
          return throwError(() => new HttpException('Auth service unavailable', 503));
        }),
      ),
    );
  }
}
