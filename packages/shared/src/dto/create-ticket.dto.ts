import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TICKET_PRIORITIES, type TicketPriority } from '../constants/ticket';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsIn(Object.values(TICKET_PRIORITIES))
  priority?: TicketPriority;
}
