import {
  correlationId,
  correlationIdFactory,
  currentUserId,
  currentUserIdFactory,
} from './current-user.decorator';

describe('current user decorators', () => {
  it('reads user id and correlation id from request', () => {
    const req: any = { user: { sub: 'user-1' }, correlationId: 'cid-1' };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(currentUserId(req)).toBe('user-1');
    expect(correlationId(req)).toBe('cid-1');
    expect(currentUserIdFactory(undefined, ctx)).toBe('user-1');
    expect(correlationIdFactory(undefined, ctx)).toBe('cid-1');
  });

  it('returns empty user id when absent', () => {
    expect(currentUserId({} as any)).toBe('');
  });
});
