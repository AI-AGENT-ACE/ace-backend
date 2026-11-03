import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { TrashRetentionService } from './trash-retention.service';

export type CleanupRun = {
  skipped: boolean;
  startedAt?: string;
  finishedAt?: string;
  deletedCount: number;
  failedCount: number;
  duration: number;
  error?: string;
};

@Injectable()
export class TrashCleanupScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TrashCleanupScheduler.name);
  private running = false;
  private startup?: NodeJS.Timeout;
  private stopped = false;
  onApplicationBootstrap() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.startup = setTimeout(() => {
      void this.scheduledCleanup();
    }, 0);
    this.startup.unref();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.startup) clearTimeout(this.startup);
  }

  constructor(
    private readonly retention: TrashRetentionService,
    private readonly config: ConfigService,
  ) {}

  @Cron(process.env.TRASH_CLEANUP_CRON || '0 3 * * *', {
    name: 'trash-cleanup',
    timeZone: process.env.TRASH_CLEANUP_TIME_ZONE || 'Asia/Seoul',
    waitForCompletion: true,
    disabled: process.env.NODE_ENV === 'test' || process.env.TRASH_CLEANUP_ENABLED === 'false',
  })
  async scheduledCleanup() {
    if (!this.config.get<boolean>('TRASH_CLEANUP_ENABLED', true))
      return { skipped: true, deletedCount: 0, failedCount: 0, duration: 0 };
    return this.runOnce();
  }

  async runOnce(): Promise<CleanupRun> {
    if (this.running) return { skipped: true, deletedCount: 0, failedCount: 0, duration: 0 };
    this.running = true;
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let deletedCount = 0;
    let failedCount = 0;
    try {
      const size = Math.min(100, this.config.get<number>('TRASH_CLEANUP_BATCH_SIZE', 100));
      const excluded: string[] = [];
      for (let batch = 0; batch < 100 && !this.stopped; batch++) {
        const result = await this.retention.purgeExpired(size, excluded);
        excluded.push(...(result.attemptedIds || []));
        deletedCount += result.deleted;
        failedCount += result.failed;
        if (result.scanned !== size || !result.attemptedIds?.length) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const run = {
        skipped: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        deletedCount,
        failedCount,
        duration: Date.now() - started,
        ...(failedCount > 0 ? { error: 'PARTIAL_CLEANUP_FAILURE' } : {}),
      };
      this.logger.log(run);
      return run;
    } catch {
      const run = {
        skipped: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        deletedCount,
        failedCount: failedCount + 1,
        duration: Date.now() - started,
        error: 'TRASH_CLEANUP_FAILED',
      };
      this.logger.error(run);
      return run;
    } finally {
      this.running = false;
    }
  }
}
