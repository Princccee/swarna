import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = config.get<string>('app.s3.endpoint') ?? 'http://localhost:9000';
    this.publicEndpoint = config.get<string>('app.s3.publicEndpoint') ?? this.endpoint;
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

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        // Uploaded item/order images are rendered directly via <img src>, so the bucket must allow anonymous reads.
        await this.client.send(
          new PutBucketPolicyCommand({
            Bucket: this.bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: { AWS: ['*'] },
                  Action: ['s3:GetObject'],
                  Resource: [`arn:aws:s3:::${this.bucket}/*`],
                },
              ],
            }),
          }),
        );
        this.logger.log(`Created S3 bucket "${this.bucket}" with public-read policy`);
      } catch (err) {
        this.logger.error(`Failed to create S3 bucket "${this.bucket}": ${(err as Error).message}`);
      }
    }
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

    return `${this.publicEndpoint}/${this.bucket}/${key}`;
  }

  async deleteFile(url: string): Promise<void> {
    const key = url.replace(`${this.publicEndpoint}/${this.bucket}/`, '');
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Failed to delete S3 object ${key}: ${(err as Error).message}`);
    }
  }
}
