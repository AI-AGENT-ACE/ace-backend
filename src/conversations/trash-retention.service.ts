import { Injectable } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import { TRASH_RETENTION_MS } from './conversations.service';

@Injectable()
export class TrashRetentionService {
  constructor(private readonly conversations: ConversationsRepository) {}

  async purgeExpired(batchSize = 500) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
      throw new RangeError('Batch size must be 1..1000');
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
    const expired = await this.conversations.expiredIds(cutoff, batchSize);
    if (!expired.length) return { scanned: 0, deleted: 0 };
    const result = await this.conversations.purge(
      expired.map((item) => item.id),
      cutoff,
    );
    return { scanned: expired.length, deleted: result.count };
  }
}
