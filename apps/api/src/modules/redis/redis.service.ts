import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('app.redis.url') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: false });
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<unknown> {
    if (ttlSeconds) return this.client.setex(key, ttlSeconds, value);
    return this.client.set(key, value);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<unknown> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }
}
