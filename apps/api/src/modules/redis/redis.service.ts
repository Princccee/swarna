import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  // Client is created in the constructor (not onModuleInit) so it exists before any other
  // module's onModuleInit uses it — Nest does not guarantee init order across modules.
  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('app.redis.url') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: false });
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  onModuleInit() {}

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

  /** SET key value EX ttl NX — returns true only if the key did not already exist. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  /** INCR a counter, starting its TTL window on first increment. Returns the new value. */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const n = await this.client.incr(key);
    if (n === 1) await this.client.expire(key, ttlSeconds);
    return n;
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
