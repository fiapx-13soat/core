import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('app.awsEndpointUrl');
    this.client = new S3Client({
      region: this.config.get<string>('app.awsRegion'),
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: endpoint ? { accessKeyId: 'test', secretAccessKey: 'test' } : undefined,
    });
  }

  async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
      }),
    );
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async presignedGet(
    bucket: string,
    key: string,
    maxSeconds = 900,
    filename?: string,
  ): Promise<string> {
    const expiresIn = Math.min(maxSeconds, 604800); // S3 permite até 7 dias
    const downloadName = filename ?? key.split('/').pop() ?? 'download.zip';
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // Sem isto o navegador abre os bytes na aba em vez de baixar. O
        // response-content-disposition entra assinado na URL e o S3 devolve o header.
        ResponseContentDisposition: `attachment; filename="${downloadName}"`,
        ResponseContentType: 'application/zip',
      }),
      { expiresIn },
    );

    const publicEndpoint = this.config.get<string>('app.s3PublicEndpoint');
    if (!publicEndpoint) {
      return url;
    }

    const target = new URL(url);
    const replacement = new URL(publicEndpoint);
    target.protocol = replacement.protocol;
    target.host = replacement.host;
    if (replacement.pathname && replacement.pathname !== '/') {
      target.pathname = `${replacement.pathname.replace(/\/$/, '')}${target.pathname}`;
    }
    return target.toString();
  }
}
