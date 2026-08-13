import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';
import type { RpcErrorPayload } from '@app/shared';

/**
 * Converts HttpExceptions thrown inside the auth-service into a normalized
 * RpcException payload the gateway can turn back into the right HTTP status.
 * Any other (unexpected) error is logged server-side and replaced with a
 * generic message so internals never cross the TCP boundary.
 */
@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('RpcExceptionFilter');

  catch(exception: unknown, _host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : (response as { message?: string | string[] }).message;
      const payload: RpcErrorPayload = {
        statusCode: exception.getStatus(),
        message: message ?? exception.message,
      };
      return throwError(() => new RpcException(payload));
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    const payload: RpcErrorPayload = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    return throwError(() => new RpcException(payload));
  }
}
