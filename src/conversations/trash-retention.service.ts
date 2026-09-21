import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationsRepository } from './conversations.repository';
import { AttachmentCleanupService } from '../attachments/attachments.service';

@Injectable()
export class TrashRetentionService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly attachments: AttachmentCleanupService,
    private readonly config: ConfigService,
  ) {}

  async purgeExpired(batchSize = 500) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
      throw new RangeError('Batch size must be 1..1000');
    const retentionDays = this.config.get<number>('TRASH_RETENTION_DAYS', 30);
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const expired = await this.conversations.expiredIds(cutoff, batchSize);
    let deleted = 0;
    let failed = 0;
    for (const item of expired) {
      try {
        await this.attachments.removeForConversations([item.id]);
        const result = await this.conversations.purge([item.id], cutoff);
        deleted += result.count;
        if (result.count !== 1) failed += 1;
      } catch {
        failed += 1;
      }
    }
    return { scanned: expired.length, deleted, failed };
  }
}
