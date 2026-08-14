import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TICKET_MAX_PAGE_SIZE, TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus } from '../constants/ticket';

/** Used by GET /tickets. Every filter is validated and applied at the database-query level (never in-memory). */
export class TicketQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TICKET_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(TICKET_STATUSES))
  status?: TicketStatus;

  @IsOptional()
  @IsIn(Object.values(TICKET_PRIORITIES))
  priority?: TicketPriority;

  /** Filter by assigned agent. Set to the literal string "me" to mean "assigned to the caller"; otherwise a user id. */
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
