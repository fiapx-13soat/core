import { StructuredLogger } from './structured-logger';
import { runWithCorrelation } from './correlation-context';

describe('StructuredLogger', () => {
  const logger = new StructuredLogger();
  let out: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    out = [];
    spy = jest.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      out.push(String(s));
      return true;
    });
  });
  afterEach(() => spy.mockRestore());

  const lastEntry = () => JSON.parse(out[out.length - 1]);

  it('emite JSON com level, message e context', () => {
    logger.log('subindo', 'Bootstrap');
    const e = lastEntry();
    expect(e).toMatchObject({ level: 'log', message: 'subindo', context: 'Bootstrap' });
    expect(e.time).toEqual(expect.any(String));
  });

  it('inclui o correlationId do escopo ALS', () => {
    runWithCorrelation('corr-123', () => logger.warn('algo', 'Ctx'));
    expect(lastEntry().correlationId).toBe('corr-123');
  });

  it('correlationId é undefined fora de um escopo', () => {
    logger.log('sem escopo');
    expect(lastEntry().correlationId).toBeUndefined();
  });

  it('funde campos de mensagem-objeto na linha', () => {
    runWithCorrelation('c-1', () => logger.warn({ message: 'falhou', jobId: 'j1', attempt: 2 }));
    expect(lastEntry()).toMatchObject({
      message: 'falhou',
      jobId: 'j1',
      attempt: 2,
      correlationId: 'c-1',
    });
  });

  it('error separa stack de context', () => {
    logger.error('quebrou', 'Error: x\n  at y', 'Consumer');
    const e = lastEntry();
    expect(e).toMatchObject({ level: 'error', message: 'quebrou', context: 'Consumer' });
    expect(e.stack).toContain('at y');
  });
});
