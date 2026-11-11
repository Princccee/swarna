import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WaTemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters: Array<{ type: 'text'; text: string }>;
}

export interface SendTemplateResult {
  messageId: string | null;
  error: string | null;
}

@Injectable()
export class WhatsAppClient {
  private readonly logger = new Logger(WhatsAppClient.name);
  private readonly apiVersion = 'v19.0';

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return !!(token && phoneId);
  }

  /** Paid, business-initiated message using a Meta-approved template. */
  async sendTemplate(
    toPhone: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<SendTemplateResult> {
    return this.send(toPhone, {
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length > 0 ? [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ] : [],
      },
    });
  }

  /**
   * Free-form text. Only deliverable inside the 24-hour customer service window
   * (i.e. as a reply after the customer messaged us), where it is free of charge.
   */
  async sendText(toPhone: string, text: string): Promise<SendTemplateResult> {
    return this.send(toPhone, {
      type: 'text',
      text: { body: text, preview_url: true },
    });
  }

  /** Image by public HTTPS link (Meta downloads it). Same 24-hour-window rule as sendText. */
  async sendImage(toPhone: string, imageUrl: string, caption?: string): Promise<SendTemplateResult> {
    return this.send(toPhone, {
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    });
  }

  private async send(toPhone: string, message: Record<string, unknown>): Promise<SendTemplateResult> {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    // Normalize phone: strip non-digits, ensure country code
    const phone = toPhone.replace(/\D/g, '');
    const e164 = phone.startsWith('91') ? phone : `91${phone}`;

    if (!token || !phoneNumberId) {
      // Dev aid: show what would have been sent
      this.logger.warn(`WhatsApp not configured — would send ${message.type} to ${e164}: ${JSON.stringify(message)}`);
      return { messageId: null, error: 'WhatsApp not configured' };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: e164, ...message }),
        },
      );

      const data: any = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
        this.logger.error(`WhatsApp send failed to ${e164}: ${errMsg}`);
        return { messageId: null, error: errMsg };
      }

      const messageId = data?.messages?.[0]?.id ?? null;
      this.logger.log(`Sent ${message.type} to ${e164}, wa_id: ${messageId}`);
      return { messageId, error: null };
    } catch (err: any) {
      this.logger.error(`WhatsApp fetch error: ${err.message}`);
      return { messageId: null, error: err.message };
    }
  }
}
