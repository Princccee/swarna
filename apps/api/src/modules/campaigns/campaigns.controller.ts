import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { CampaignsService } from './campaigns.service';
import { CampaignDispatchService } from './campaign-dispatch.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly dispatch: CampaignDispatchService,
  ) {}

  // ── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  listTemplates() {
    return this.campaigns.listTemplates();
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.campaigns.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.campaigns.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.campaigns.deleteTemplate(id);
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────

  @Get()
  listCampaigns(@Query('status') status?: string) {
    return this.campaigns.listCampaigns(status);
  }

  @Post()
  createCampaign(@Body() dto: CreateCampaignDto, @Req() req: any) {
    return this.campaigns.createCampaign(dto, req.user.id);
  }

  @Get(':id')
  getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaign(id);
  }

  @Patch(':id')
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.updateCampaign(id, dto);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activateCampaign(@Param('id') id: string) {
    return this.campaigns.setCampaignStatus(id, 'ACTIVE');
  }

  @Post(':id/pause')
  @HttpCode(200)
  pauseCampaign(@Param('id') id: string) {
    return this.campaigns.setCampaignStatus(id, 'PAUSED');
  }

  @Post(':id/send-now')
  @HttpCode(200)
  sendNow(@Param('id') id: string) {
    return this.dispatch.dispatchCampaign(id);
  }

  @Get(':id/messages')
  getCampaignMessages(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.campaigns.getCampaignMessages(id, Number(page), Number(limit));
  }

  // ── WhatsApp status ───────────────────────────────────────────────────────

  @Get('whatsapp/status')
  @Roles(Role.OWNER)
  getWhatsAppStatus() {
    return this.campaigns.getWhatsAppStatus();
  }
}
