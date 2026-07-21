import { AppModule, jwtOptionsFactory } from './app.module';

describe('AppModule', () => {
  it('builds jwt options', () => {
    expect(jwtOptionsFactory({ get: () => 'secret' } as any)).toEqual({ secret: 'secret' });
  });

  it('applies correlation middleware for all routes', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    new AppModule().configure({ apply } as any);
    expect(apply).toHaveBeenCalled();
    expect(forRoutes).toHaveBeenCalledWith('*');
  });
});

