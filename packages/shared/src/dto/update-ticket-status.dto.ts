import { IsIn } from 'class-validator';
import { TICKET_STATUSES, type TicketStatus } from '../constants/ticket';

export class UpdateTicketStatusDto {
  @IsIn(Object.values(TICKET_STATUSES))
  status!: TicketStatus;
}
