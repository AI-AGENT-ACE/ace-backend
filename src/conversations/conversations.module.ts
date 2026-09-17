import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { TrashRetentionService } from './trash-retention.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsRepository, ConversationsService, TrashRetentionService],
  exports: [ConversationsService, TrashRetentionService],
})
export class ConversationsModule {}
