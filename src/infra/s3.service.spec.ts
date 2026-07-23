import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn()
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

describe('S3Service', () => {
  const send = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it('uploads object and checks existence', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const service = new S3Service({ get: (key: string) => (key === 'app.awsRegion' ? 'us-east-1' : '') } as any);
    await service.upload('b', 'k', Buffer.from('x'), 'video/mp4');
    await expect(service.exists('b', 'k')).resolves.toBe(true);
    expect(PutObjectCommand).toHaveBeenCalled();
    expect(HeadObjectCommand).toHaveBeenCalled();
  });

  it('returns false on missing head object and rewrites public url', async () => {
    send.mockRejectedValueOnce(new Error('missing'));
    (getSignedUrl as jest.Mock).mockResolvedValue('https://internal/signed');
    const service = new S3Service({
      get: (key: string) =>
        key === 'app.awsRegion' ? 'us-east-1' : key === 'app.s3PublicEndpoint' ? 'https://public/base' : ''
    } as any);
    await expect(service.exists('b', 'k')).resolves.toBe(false);
    await expect(service.presignedGet('b', 'k', 999)).resolves.toBe('https://public/base/signed');
    expect(GetObjectCommand).toHaveBeenCalled();
  });
});
