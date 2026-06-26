import { Injectable, Logger, Optional } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../redis/redis.service';

interface Notification {
  id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const REDIS_KEY = (userId: string) => `notifications:${userId}`;
const MAX_NOTIFICATIONS = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /**
   * Optional Socket.IO server reference. A gateway (or app bootstrap) can set
   * this after initialisation so that sendInAppNotification can emit events.
   */
  socketServer?: Server;

  constructor(private readonly redis: RedisService) {}

  async sendInAppNotification(
    userId: string,
    message: string,
    type: string,
  ): Promise<void> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    };

    const key = REDIS_KEY(userId);
    const existing = (await this.redis.getJson<Notification[]>(key)) ?? [];

    // Prepend newest first, trim to max 50
    const updated = [notification, ...existing].slice(0, MAX_NOTIFICATIONS);
    await this.redis.setJson(key, updated);

    // Emit Socket.IO event if server is available
    if (this.socketServer) {
      this.socketServer
        .to(`user:${userId}`)
        .emit('notification:new', notification);
    }

    this.logger.debug(
      `Notification sent to user ${userId}: [${type}] ${message}`,
    );
  }

  async getNotifications(
    userId: string,
  ): Promise<{ items: Notification[]; unreadCount: number }> {
    const key = REDIS_KEY(userId);
    const items = (await this.redis.getJson<Notification[]>(key)) ?? [];
    const unreadCount = items.filter((n) => !n.read).length;
    return { items, unreadCount };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const key = REDIS_KEY(userId);
    const items = (await this.redis.getJson<Notification[]>(key)) ?? [];

    let found = false;
    const updated = items.map((n) => {
      if (n.id === notificationId) {
        found = true;
        return { ...n, read: true };
      }
      return n;
    });

    if (!found) {
      this.logger.warn(
        `markRead: notification ${notificationId} not found for user ${userId}`,
      );
      return;
    }

    await this.redis.setJson(key, updated);
  }
}
