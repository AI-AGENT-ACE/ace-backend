import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, rm, access, writeFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { StorageService, StoredFile } from './storage.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  }
  absolutePath(storagePath: string) {
    const target = resolve(this.root, storagePath);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`))
      throw new Error('Invalid storage path');
    return target;
  }
  async save(relativeDirectory: string, extension: string, contents: Buffer): Promise<StoredFile> {
    const storedName = `${randomUUID()}.${extension}`;
    const storagePath = `${relativeDirectory.replace(/\\/g, '/')}/${storedName}`;
    const target = this.absolutePath(storagePath);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, contents, { flag: 'wx', mode: 0o600 });
    return { storedName, storagePath };
  }
  async delete(storagePath: string) {
    await rm(this.absolutePath(storagePath), { force: true });
  }
  async exists(storagePath: string) {
    try {
      await access(this.absolutePath(storagePath));
      return true;
    } catch {
      return false;
    }
  }
}
