import { Body, Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  getAll(@Req() req: any): Promise<{ items: { id: string; message: string; type: string; read: boolean; createdAt: string }[]; unreadCount: number }> { return this.notifications.getNotifications(req.user.userId); }

  @Patch(':id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }
}
