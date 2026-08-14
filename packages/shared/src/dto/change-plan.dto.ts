import { IsIn } from 'class-validator';
import { PLAN_TYPES, type PlanType } from '../constants/subscription';

export class ChangePlanDto {
  @IsIn(Object.values(PLAN_TYPES))
  plan!: PlanType;
}
