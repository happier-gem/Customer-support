import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Defense-in-depth on top of Nest's default handling: any error that isn't a
 * deliberately-thrown HttpException (including transport-level failures
 * talking to auth-service) is logged server-side but only a generic message
 * is sent to the client, so internals never leak in a response body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
