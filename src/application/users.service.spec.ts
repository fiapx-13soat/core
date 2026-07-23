import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const db: any = {
    createUser: jest.fn(),
    isUniqueViolation: jest.fn(),
    findUserById: jest.fn(),
    updateUserName: jest.fn(),
    deactivateUser: jest.fn()
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(db as any);
  });

  it('creates user', async () => {
    db.createUser.mockResolvedValue(undefined);
    const result = await service.createUser({ email: 'TEST@EXAMPLE.COM', name: '  Ana  ', password: 'secret' });
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Ana');
  });

  it('maps duplicate email to conflict', async () => {
    db.createUser.mockRejectedValue(new Error('duplicate'));
    db.isUniqueViolation.mockReturnValue(true);
    await expect(service.createUser({ email: 'a@b.com', name: 'A', password: 'p' })).rejects.toThrow(ConflictException);
  });

  it('rethrows unexpected create errors', async () => {
    db.createUser.mockRejectedValue(new Error('boom'));
    db.isUniqueViolation.mockReturnValue(false);
    await expect(service.createUser({ email: 'a@b.com', name: 'A', password: 'p' })).rejects.toThrow('boom');
  });

  it('returns own user when ids match', async () => {
    db.findUserById.mockResolvedValue({ id: 'u1', email: 'e', name: 'n', active: true });
    await expect(service.getOwnUser('u1', 'u1')).resolves.toEqual({ id: 'u1', email: 'e', name: 'n', active: true });
  });

  it('rejects when own user is missing', async () => {
    db.findUserById.mockResolvedValue(null);
    await expect(service.getOwnUser('u1', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('rejects foreign user', async () => {
    await expect(service.getOwnUser('u1', 'u2')).rejects.toThrow(NotFoundException);
  });

  it('patches and deletes own user', async () => {
    await service.patchOwnUser('u1', 'u1', ' New ');
    await service.deleteOwnUser('u1', 'u1');
    expect(db.updateUserName).toHaveBeenCalledWith('u1', 'New');
    expect(db.deactivateUser).toHaveBeenCalledWith('u1');
  });

  it('rejects patch/delete for foreign user', async () => {
    await expect(service.patchOwnUser('u1', 'u2', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.deleteOwnUser('u1', 'u2')).rejects.toThrow(NotFoundException);
  });
});
