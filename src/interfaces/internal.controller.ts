import { Controller, Get, Param } from '@nestjs/common';
import { JobsService } from '../application/jobs.service';

@Controller('/internal/jobs')
export class InternalController {
  constructor(private readonly jobs: JobsService) {}

  @Get('/:jobId/notification-info')
  getNotificationInfo(@Param('jobId') jobId: string) {
    return this.jobs.getNotificationInfo(jobId);
  }
}
