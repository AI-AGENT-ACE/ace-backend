import { Module } from '@nestjs/common';
import { ToolCatalogModule } from '../tools/catalog/tool-catalog.module';
import { LogsController } from './logs.controller';
import { LogsRepository } from './logs.repository';
import { LogsService } from './logs.service';
import { AgentEventsService } from './agent-events.service';

@Module({
  imports: [ToolCatalogModule],
  controllers: [LogsController],
  providers: [LogsRepository, LogsService, AgentEventsService],
  exports: [LogsService, AgentEventsService],
})
export class LogsModule {}
