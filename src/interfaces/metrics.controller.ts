import { Controller, Get, Header } from '@nestjs/common';
// register + collectDefaultMetrics e os meters de negócio vivem em infra/metrics
// (importar aqui garante que os meters são registrados quando o módulo sobe).
import { register } from '../infra/metrics';

@Controller()
export class MetricsController {
  @Get('/metrics')
  @Header('Content-Type', register.contentType)
  async metrics(): Promise<string> {
	return register.metrics();
  }
}

