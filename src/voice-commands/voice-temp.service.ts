import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

@Injectable()
export class VoiceTempService implements OnModuleInit, OnModuleDestroy {
  private readonly directory: string;
  private timer?: NodeJS.Timeout;
  constructor(private readonly config: ConfigService) {
    this.directory = resolve(config.getOrThrow<string>('VOICE_TEMP_DIR'));
  }
  async onModuleInit() {
    await mkdir(this.directory, { recursive: true });
    await this.cleanupExpired();
    this.timer = setInterval(
      () => void this.cleanupExpired(),
      this.config.getOrThrow<number>('VOICE_CLEANUP_INTERVAL_SECONDS') * 1000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async create(buffer: Buffer) {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${randomUUID()}.wav`);
    await writeFile(path, buffer, { flag: 'wx', mode: 0o600 });
    return path;
  }
  async remove(path: string) {
    if (!resolve(path).startsWith(`${this.directory}${process.platform === 'win32' ? '\\' : '/'}`))
      return;
    await rm(path, { force: true }).catch(() => undefined);
  }
  async cleanupExpired(now = Date.now()) {
    const ttl = this.config.getOrThrow<number>('VOICE_TEMP_TTL_SECONDS') * 1000;
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !/^[0-9a-f-]{36}\.wav$/i.test(entry.name)) continue;
      const path = join(this.directory, entry.name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > ttl) await this.remove(path);
    }
  }
}
