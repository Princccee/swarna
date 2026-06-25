import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = config.get<string>('app.s3.endpoint') ?? 'http://localhost:9000';
    this.bucket = config.get<string>('app.s3.bucket') ?? 'svarna';

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: config.get<string>('app.s3.region') ?? 'ap-south-1',
      credentials: {
        accessKeyId: config.get<string>('app.s3.accessKey') ?? 'minioadmin',
        secretAccessKey: config.get<string>('app.s3.secretKey') ?? 'minioadmin',
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  async uploadFile(
    buffer: Buffer,
    mimetype: string,
    folder: string,
    originalName: string,
  ): Promise<string> {
    const ext = originalName.split('.').pop() ?? 'jpg';
    const key = `${folder}/${uuidv4()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async deleteFile(url: string): Promise<void> {
    const key = url.replace(`${this.endpoint}/${this.bucket}/`, '');
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Failed to delete S3 object ${key}: ${(err as Error).message}`);
    }
  }
}
