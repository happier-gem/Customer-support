import { HttpException, HttpStatus } from '@nestjs/common';
import { PLAN_LIMIT_ERROR_CODE, PlanFeature, PlanType } from '@app/shared';

/**
 * Thrown when a plan limit blocks an operation (Part 10). Carries structured
 * detail in the response body (`code`, `data`) in addition to `message`, so
 * RpcExceptionFilter / AuthGatewayService can forward it to the frontend
 * verbatim instead of collapsing it into a generic 500 or a plain string.
 */
export class PlanLimitExceededException extends HttpException {
  constructor(feature: PlanFeature, plan: PlanType, limit: number, currentUsage: number, message: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        code: PLAN_LIMIT_ERROR_CODE,
        data: { code: PLAN_LIMIT_ERROR_CODE, feature, plan, limit, currentUsage, message },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
