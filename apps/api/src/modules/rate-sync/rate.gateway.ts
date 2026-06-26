import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

export interface RateUpdatePayload {
  metal: string;
  purity: string;
  ratePerGram: number;
  snappedAt: string;
}

@WebSocketGateway({ namespace: '/rates', cors: { origin: '*' } })
export class RateGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RateGateway.name);

  constructor(private readonly redis: RedisService) {}

  afterInit() {
    this.logger.log('RateGateway initialised on namespace /rates');
  }

  async handleConnection(client: Socket) {
    client.join('rates');
    const snapshot = await this.getCurrentSnapshot();
    client.emit('rate:snapshot', snapshot);
  }

  broadcastRateUpdate(payload: RateUpdatePayload) {
    this.server?.to('rates').emit('rate:update', payload);
  }

  private async getCurrentSnapshot(): Promise<RateUpdatePayload[]> {
    const keys = await this.redis.keys('rate:*');
    const results: RateUpdatePayload[] = [];
    for (const key of keys) {
      const val = await this.redis.getJson<Omit<RateUpdatePayload, 'metal' | 'purity'>>(key);
      if (val) {
        const [, metal, purity] = key.split(':');
        results.push({ metal, purity, ...val });
      }
    }
    return results;
  }
}
