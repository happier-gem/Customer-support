import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TICKET_PRIORITIES, type TicketPriority } from '../constants/ticket';

/** Used by PATCH /tickets/:id. Deliberately excludes status and assignment — those have their own endpoints. */
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(Object.values(TICKET_PRIORITIES))
  priority?: TicketPriority;
}
