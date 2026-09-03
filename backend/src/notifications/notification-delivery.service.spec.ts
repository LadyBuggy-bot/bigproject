import { ConfigService } from '@nestjs/config';
import { NotificationDeliveryService } from './notification-delivery.service';
import { ChannelNotConfigured } from './notification-transport.service';

describe('Notification delivery guarantees', () => {
  const updates = jest.fn();
  const send = jest.fn();
  const visible = jest.fn();
  const emit = jest.fn();
  const due = {
    id: 'delivery',
    notificationId: 'n',
    channel: 'EMAIL',
    attempts: 0,
    leasedAt: null,
    status: 'PENDING',
  };
  const prisma = {
    notificationDelivery: { findMany: jest.fn().mockResolvedValue([due]), updateMany: updates },
    notification: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'n', userId: 'u', entityType: 'DEAL', entityId: 'd' }),
    },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'user@example.invalid' }) },
  };
  const service = new NotificationDeliveryService(
    prisma as never,
    { context: jest.fn().mockResolvedValue({ id: 'u' }), visible } as never,
    { send } as never,
    { emitToUsers: emit } as never,
    new ConfigService({}),
  );
  beforeEach(() => {
    jest.clearAllMocks();
    updates.mockResolvedValue({ count: 1 });
    visible.mockResolvedValue(true);
    send.mockResolvedValue(undefined);
  });
  test('revoked access suppresses external delivery', async () => {
    visible.mockResolvedValue(false);
    await service.tick();
    expect(send).not.toHaveBeenCalled();
    expect(updates.mock.calls.some((call) => call[0].data.status === 'SKIPPED')).toBe(true);
  });
  test('an unconfigured channel is FAILED, never falsely SENT', async () => {
    send.mockRejectedValue(new ChannelNotConfigured());
    await service.tick();
    expect(updates.mock.calls.some((call) => call[0].data.status === 'FAILED')).toBe(true);
    expect(updates.mock.calls.some((call) => call[0].data.status === 'SENT')).toBe(false);
  });
  test('a delivery claimed by another process is not sent twice', async () => {
    updates.mockResolvedValueOnce({ count: 0 });
    await service.tick();
    expect(send).not.toHaveBeenCalled();
  });
  test('transient failures are retried without provider error details in the database', async () => {
    send.mockRejectedValue(new Error('SECRET_CREDENTIAL'));
    await service.tick();
    expect(updates.mock.calls.some((call) => call[0].data.status === 'PENDING')).toBe(true);
    expect(JSON.stringify(updates.mock.calls)).not.toContain('SECRET_CREDENTIAL');
  });
});
