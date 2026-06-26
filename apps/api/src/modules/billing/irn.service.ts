import { Injectable, Logger } from '@nestjs/common';

export interface IrnResult {
  irn: string;
  ackNo: string;
  ackDate: string;
  signedQrCode: string;
}

@Injectable()
export class IrnService {
  private readonly logger = new Logger(IrnService.name);

  async registerIrn(invoiceId: string, invoiceNumber: string): Promise<IrnResult> {
    // Mock implementation - replace with real NIC IRP API call in production
    this.logger.log('Registering IRN for invoice: ' + invoiceNumber);
    // Simulate async delay
    await new Promise((r) => setTimeout(r, 100));
    const hash = Buffer.from(invoiceId).toString('hex').slice(0, 32).toUpperCase();
    return {
      irn: hash + 'IRN' + Date.now().toString(36).toUpperCase(),
      ackNo: 'ACK' + Date.now().toString(),
      ackDate: new Date().toISOString(),
      signedQrCode: 'data:image/png;base64,MOCK_QR_' + invoiceNumber,
    };
  }
}
