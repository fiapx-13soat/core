import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('returns payload sub as user id', () => {
    const strategy = new JwtStrategy({ get: () => 'secret' } as any);
    expect(strategy.validate({ sub: 'user-1' })).toEqual({ sub: 'user-1' });
  });
});

