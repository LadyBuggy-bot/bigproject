import { EventsGateway } from './events.gateway';
import { AuthService } from '../auth/auth.service';
import { Socket } from 'socket.io';

describe('EventsGateway', () => {
  const authenticate = jest.fn();
  const gateway = new EventsGateway({ authenticate } as unknown as AuthService);
  const makeSocket = (id: string) => ({
    id,
    connected: true,
    handshake: { auth: { token: id } },
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });
  afterEach(() => jest.clearAllMocks());
  test('invalid connection is rejected', async () => {
    const socket = makeSocket('bad');
    authenticate.mockRejectedValue(new Error('revoked'));
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });
  test('only recipients receive invalidations; expired/revoked sessions cannot receive', async () => {
    authenticate.mockImplementation((token: string) =>
      Promise.resolve({ user: { id: token }, claims: { exp: Date.now() / 1000 + 600 } }),
    );
    const one = makeSocket('one');
    const two = makeSocket('two');
    await gateway.handleConnection(one as unknown as Socket);
    await gateway.handleConnection(two as unknown as Socket);
    await gateway.emitToUsers(['one'], 'deal.updated', {
      entityType: 'DEAL',
      entityId: 'deal',
      action: 'updated',
      amount: 'SECRET',
    } as Parameters<EventsGateway['emitToUsers']>[2]);
    expect(one.emit).toHaveBeenCalledWith('deal.updated', {
      entityType: 'DEAL',
      entityId: 'deal',
      action: 'updated',
    });
    expect(two.emit).not.toHaveBeenCalled();
    authenticate.mockRejectedValue(new Error('revoked'));
    one.emit.mockClear();
    await gateway.emitToUsers(['one'], 'deal.updated', {
      entityType: 'DEAL',
      entityId: 'deal',
      action: 'updated',
    });
    expect(one.emit).not.toHaveBeenCalled();
    expect(one.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(one as unknown as Socket);
    gateway.handleDisconnect(two as unknown as Socket);
  });
});
