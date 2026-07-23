import { VideosController } from './videos.controller';

describe('VideosController', () => {
  it('delegates upload to service', async () => {
    const jobs: any = { uploadVideo: jest.fn().mockResolvedValue({ jobId: 'j1' }) };
    const controller = new VideosController(jobs);
    await expect(controller.upload('u1', 'cid', { originalname: 'v.mp4' } as any)).resolves.toEqual({ jobId: 'j1' });
    expect(jobs.uploadVideo).toHaveBeenCalledWith('u1', 'cid', { originalname: 'v.mp4' });
  });
});
