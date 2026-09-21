import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TrashRetentionService } from '../conversations/trash-retention.service';

async function purge() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const retention = app.get(TrashRetentionService);
    let deleted = 0;
    let failed = 0;
    let batch;
    do {
      batch = await retention.purgeExpired();
      deleted += batch.deleted;
      failed += batch.failed;
    } while (batch.scanned > 0 && batch.failed === 0);
    console.log(`Expired conversations permanently deleted: ${deleted}; failed: ${failed}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
void purge().catch(() => {
  console.error('Trash cleanup failed. Check PostgreSQL and migrations.');
  process.exitCode = 1;
});
