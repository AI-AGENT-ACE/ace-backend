import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  it('uses distinct salts and verifies only the correct password', async () => {
    const hasher = new PasswordHasher();
    const first = await hasher.hash('long-password-123');
    const second = await hasher.hash('long-password-123');
    expect(first).not.toBe(second);
    expect(first).not.toContain('long-password-123');
    expect(await hasher.verify('long-password-123', first)).toBe(true);
    expect(await hasher.verify('wrong-password-123', first)).toBe(false);
    expect(await hasher.verify('long-password-123')).toBe(false);
  });
  it('rejects corrupted or unsupported stored hashes', async () => {
    expect(
      await new PasswordHasher().verify('long-password-123', 'scrypt$9999999$8$1$salt$hash'),
    ).toBe(false);
  });
});
