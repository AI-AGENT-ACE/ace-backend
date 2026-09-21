import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { TrashRetentionService } from './trash-retention.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { TrashCleanupScheduler } from './trash-cleanup.scheduler';

@Module({
  imports: [AttachmentsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsRepository,
    ConversationsService,
    TrashRetentionService,
    TrashCleanupScheduler,
  ],
  exports: [ConversationsService, TrashRetentionService, TrashCleanupScheduler],
})
export class ConversationsModule {}
