import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ROLES } from '@app/shared';
import { TicketsGateway } from './tickets.gateway';

describe('TicketsGateway', () => {
  function makeGateway(verifyAsync: jest.Mock) {
    const jwt = { verifyAsync } as unknown as JwtService;
    const config = { get: () => 'test-secret' } as unknown as ConfigService;
    return new TicketsGateway(jwt, config);
  }

  function makeSocket(token?: string) {
    return {
      handshake: { auth: token ? { token } : {} },
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    } as any;
  }

  const basePayload = {
    sub: 'user-1',
    email: 'a@example.com',
    organizationId: 'org-1',
    role: ROLES.TENANT_OWNER,
    type: 'access' as const,
  };

  it('joins a staff (non-customer) socket to the organization room', async () => {
    const gateway = makeGateway(jest.fn().mockResolvedValue(basePayload));
    const socket = makeSocket('a-valid-token');

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith('org:org-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('joins a customer socket to their own private room, never the org room', async () => {
    const gateway = makeGateway(jest.fn().mockResolvedValue({ ...basePayload, role: ROLES.CUSTOMER }));
    const socket = makeSocket('a-valid-token');

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith('customer:user-1');
    expect(socket.join).not.toHaveBeenCalledWith('org:org-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with no token at all', async () => {
    const gateway = makeGateway(jest.fn());
    const socket = makeSocket(undefined);

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a socket whose token fails verification (invalid/expired)', async () => {
    const gateway = makeGateway(jest.fn().mockRejectedValue(new Error('invalid signature')));
    const socket = makeSocket('a-bad-token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a refresh-typed token presented in place of an access token', async () => {
    const gateway = makeGateway(jest.fn().mockResolvedValue({ ...basePayload, type: 'refresh' }));
    const socket = makeSocket('a-refresh-token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a payload missing organizationId', async () => {
    const { organizationId, ...rest } = basePayload;
    const gateway = makeGateway(jest.fn().mockResolvedValue(rest));
    const socket = makeSocket('a-valid-token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  describe('emitToOrg / emitToCustomer', () => {
    it('emits to the correct room via the underlying Socket.IO server', () => {
      const gateway = makeGateway(jest.fn());
      const to = jest.fn().mockReturnValue({ emit: jest.fn() });
      (gateway as any).server = { to };

      gateway.emitToOrg('org-1', 'ticket:created', { ticket: { id: 't-1' } });
      expect(to).toHaveBeenCalledWith('org:org-1');

      gateway.emitToCustomer('user-1', 'ticket:updated', { ticket: { id: 't-1' } });
      expect(to).toHaveBeenCalledWith('customer:user-1');
    });

    it('does not throw when the server is not yet attached', () => {
      const gateway = makeGateway(jest.fn());
      expect(() => gateway.emitToOrg('org-1', 'ticket:created', {})).not.toThrow();
    });
  });
});
