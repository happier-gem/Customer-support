import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtAccessPayload, ROLES } from '@app/shared';

export type TicketSocketEvent = 'ticket:created' | 'ticket:updated' | 'ticket:attachment-added' | 'ticket:message-added';

/**
 * Phase 10 real-time layer. Business logic stays entirely in auth-service —
 * this gateway only relays events *after* TicketsController has already
 * received a successful RPC response, so auth-service never becomes aware
 * sockets exist (see TicketsController for the emit call sites).
 *
 * Room membership mirrors the same tenant/customer scoping already enforced
 * over REST (TicketsService.getAccessibleTicket): a TENANT_OWNER/SUPPORT_AGENT
 * socket joins the whole-organization room (staff can see every ticket in
 * their org), while a CUSTOMER socket joins only their own private room, so
 * they never receive events about another customer's ticket.
 */
@WebSocketGateway({
  namespace: '/ws/tickets',
  cors: { origin: true, credentials: true },
})
@Injectable()
export class TicketsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TicketsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'access' || !payload.sub || !payload.organizationId || !payload.role) {
        client.disconnect(true);
        return;
      }

      if (payload.role === ROLES.CUSTOMER) {
        await client.join(`customer:${payload.sub}`);
      } else {
        await client.join(`org:${payload.organizationId}`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  /** Staff-facing broadcast: everyone in the organization can see every ticket. */
  emitToOrg(organizationId: string, event: TicketSocketEvent, payload: Record<string, unknown>): void {
    this.server?.to(`org:${organizationId}`).emit(event, payload);
  }

  /** Customer-facing broadcast: scoped to a single customer's own room only. */
  emitToCustomer(customerId: string, event: TicketSocketEvent, payload: Record<string, unknown>): void {
    this.server?.to(`customer:${customerId}`).emit(event, payload);
  }
}
