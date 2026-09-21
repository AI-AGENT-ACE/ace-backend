import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { TrashRetentionService } from './trash-retention.service';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [AttachmentsModule],
  controllers: [ConversationsController],
  providers: [ConversationsRepository, ConversationsService, TrashRetentionService],
  exports: [ConversationsService, TrashRetentionService],
})
export class ConversationsModule {}
