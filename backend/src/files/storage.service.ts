import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION', 'us-east-1'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', 'true') === 'true',
      maxAttempts: 2,
      requestHandler: { requestTimeout: 15000 },
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', ''),
        secretAccessKey: config.get('S3_SECRET_KEY', ''),
      },
    });
  }
  async put(key: string, buffer: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.getOrThrow('S3_BUCKET'),
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }
  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.getOrThrow('S3_BUCKET'), Key: key }),
    );
    if (!result.Body) throw new Error('Storage returned no content');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.getOrThrow('S3_BUCKET'), Key: key }),
    );
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
