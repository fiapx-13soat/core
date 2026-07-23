import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JobsService } from '../application/jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId, CorrelationId } from '../common/current-user.decorator';
import { UploadRateLimitGuard } from '../common/upload-rate-limit.guard';

@Controller('/api/v1/videos')
@UseGuards(JwtAuthGuard)
export class VideosController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor('video', { storage: memoryStorage() }))
  upload(
    @CurrentUserId() userId: string,
    @CorrelationId() correlationId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.jobs.uploadVideo(userId, correlationId, file);
  }
}
