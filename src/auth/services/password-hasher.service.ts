import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

@Injectable()
export class PasswordHasher {
  private readonly dummy = this.hash(randomBytes(32).toString('hex'));

  private derive(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  }

  async hash(password: string) {
    const salt = randomBytes(16).toString('hex');
    const key = await this.derive(password, salt);
    return ['scrypt', '131072', '8', '1', salt, key.toString('hex')].join('$');
  }

  async verify(password: string, stored?: string) {
    const [algorithm, n, r, p, salt, digest, extra] = (stored ?? (await this.dummy)).split('$');
    if (
      extra ||
      algorithm !== 'scrypt' ||
      n !== '131072' ||
      r !== '8' ||
      p !== '1' ||
      !salt ||
      !digest ||
      !/^[a-f0-9]{32}$/.test(salt) ||
      !/^[a-f0-9]{128}$/.test(digest)
    )
      return false;
    const key = await this.derive(password, salt);
    return timingSafeEqual(key, Buffer.from(digest, 'hex')) && stored !== undefined;
  }
}
