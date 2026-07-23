import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JobsService } from '../application/jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId, CorrelationId } from '../common/current-user.decorator';

@Controller('/api/v1/jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query() query: { status?: string; from?: string; to?: string; cursor?: string; limit?: string }
  ) {
    return this.jobs.listJobs(userId, query);
  }

  @Get('/:id')
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.jobs.getJob(userId, id);
  }

  @Post('/:id/cancel')
  cancel(@CurrentUserId() userId: string, @CorrelationId() correlationId: string, @Param('id') id: string) {
    return this.jobs.cancelJob(userId, correlationId, id);
  }

  @Post('/:id/reprocess')
  reprocess(@CurrentUserId() userId: string, @CorrelationId() correlationId: string, @Param('id') id: string) {
    return this.jobs.reprocessJob(userId, correlationId, id);
  }

  @Get('/:id/download-link')
  downloadLink(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.jobs.getDownloadLink(userId, id);
  }
}
