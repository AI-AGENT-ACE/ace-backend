import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './services/password-hasher.service';
import { TokenService } from './services/token.service';
import { UsersRepository } from '../users/users.repository';

describe('AuthService', () => {
  const pair = {
    accessToken: 'access',
    refreshToken: 'new-refresh',
    refreshExpiresAt: new Date('2030-01-01'),
    expiresIn: 900,
    tokenType: 'Bearer',
  };
  const user = { id: 'user-a', email: 'ace@example.com', displayName: 'ACE' };
  let users: { create: jest.Mock; findCredentials: jest.Mock; findProfile: jest.Mock };
  let sessions: { createSession: jest.Mock; rotate: jest.Mock; revoke: jest.Mock };
  let passwords: { hash: jest.Mock; verify: jest.Mock };
  let tokens: { issue: jest.Mock; verify: jest.Mock; digest: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = {
      create: jest.fn().mockResolvedValue(user),
      findCredentials: jest.fn(),
      findProfile: jest.fn().mockResolvedValue(user),
    };
    sessions = {
      createSession: jest.fn(),
      rotate: jest.fn().mockResolvedValue({ count: 1 }),
      revoke: jest.fn(),
    };
    passwords = { hash: jest.fn().mockResolvedValue('safe-hash'), verify: jest.fn() };
    tokens = {
      issue: jest.fn().mockResolvedValue(pair),
      verify: jest.fn().mockResolvedValue({ sub: 'user-a', sid: 'session-a' }),
      digest: jest.fn((value: string) => `digest:${value}`),
    };
    service = new AuthService(
      users as unknown as UsersRepository,
      sessions as unknown as AuthRepository,
      passwords as unknown as PasswordHasher,
      tokens as unknown as TokenService,
    );
  });

  it('registers with a password hash and persists only the refresh digest', async () => {
    const result = await service.register({
      email: user.email,
      password: 'long-password-123',
      displayName: 'ACE',
    });
    expect(users.create).toHaveBeenCalledWith(user.email, 'safe-hash', 'ACE');
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.any(String),
      user.id,
      'digest:new-refresh',
      pair.refreshExpiresAt,
    );
    expect(result.user).not.toHaveProperty('passwordHash');
  });
  it('performs a password check for an unknown account without issuing tokens', async () => {
    users.findCredentials.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: user.email, password: 'long-password-123' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(passwords.verify).toHaveBeenCalledWith('long-password-123', undefined);
    expect(tokens.issue).not.toHaveBeenCalled();
  });
  it('rejects an incorrect password', async () => {
    users.findCredentials.mockResolvedValue({ ...user, passwordHash: 'stored-hash' });
    passwords.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: user.email, password: 'wrong-password-123' }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('logs in without exposing credential fields', async () => {
    users.findCredentials.mockResolvedValue({ ...user, passwordHash: 'stored-hash' });
    passwords.verify.mockResolvedValue(true);
    const result = await service.login({ email: user.email, password: 'long-password-123' });
    expect(result.user).toEqual(user);
    expect(result.accessToken).toBe('access');
  });
  it('rotates the refresh digest with an atomic compare-and-swap', async () => {
    await service.refresh('previous-refresh');
    expect(sessions.rotate).toHaveBeenCalledWith(
      'session-a',
      'user-a',
      'digest:previous-refresh',
      'digest:new-refresh',
      pair.refreshExpiresAt,
    );
  });
  it('revokes a session if a refresh token is reused', async () => {
    sessions.rotate.mockResolvedValue({ count: 0 });
    await expect(service.refresh('previous-refresh')).rejects.toMatchObject({ status: 401 });
    expect(sessions.revoke).toHaveBeenCalledWith('session-a', 'user-a');
  });
  it('rejects an invalid refresh signature without changing a session', async () => {
    tokens.verify.mockRejectedValue(new Error('invalid signature'));
    await expect(service.refresh('invalid-refresh')).rejects.toMatchObject({ status: 401 });
    expect(sessions.rotate).not.toHaveBeenCalled();
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
  it('logs out the authenticated session', async () => {
    await service.logout('user-a', 'session-a');
    expect(sessions.revoke).toHaveBeenCalledWith('session-a', 'user-a');
  });
});
