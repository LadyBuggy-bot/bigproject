import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

// Invalidate cached objects; fetch contents through the authorized HTTP API.
export interface EntityEvent {
  entityType: string;
  entityId: string;
  action: 'created' | 'updated' | 'deleted';
}

@WebSocketGateway({ namespace: '/events', transports: ['websocket'] })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly clients = new Map<
    string,
    { socket: Socket; token: string; userId: string; expiry: ReturnType<typeof setTimeout> }
  >();
  constructor(private readonly auth: AuthService) {}

  async handleConnection(socket: Socket) {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      socket.disconnect(true);
      return;
    }
    try {
      const { user, claims } = await this.auth.authenticate(token);
      if (!socket.connected) return;
      await socket.join(`user:${user.id}`);
      const expiry = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, claims.exp * 1000 - Date.now()),
      );
      expiry.unref();
      this.clients.set(socket.id, { socket, token, userId: user.id, expiry });
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const client = this.clients.get(socket.id);
    if (client) clearTimeout(client.expiry);
    this.clients.delete(socket.id);
  }

  // Caller derives recipients through PermissionService, including ACL checks.
  // Single-instance implementation; multi-instance fanout needs a Redis adapter.
  async emitToUsers(userIds: string[], event: string, payload: EntityEvent): Promise<void> {
    const recipients = new Set(userIds);
    const safePayload: EntityEvent = {
      entityType: payload.entityType,
      entityId: payload.entityId,
      action: payload.action,
    };
    await Promise.all(
      [...this.clients.values()]
        .filter(({ userId }) => recipients.has(userId))
        .map(async (client) => {
          try {
            await this.auth.authenticate(client.token);
            client.socket.emit(event, safePayload);
          } catch {
            client.socket.disconnect(true);
          }
        }),
    );
  }
}
