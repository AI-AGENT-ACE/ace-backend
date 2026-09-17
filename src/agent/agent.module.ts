import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '../common/http/http.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LogsModule } from '../logs/logs.module';
import { MessagesModule } from '../messages/messages.module';
import { SettingsModule } from '../settings/settings.module';
import { ToolsModule } from '../tools/tools.module';
import { HttpAiServerClient } from './adapters/http-ai-server.client';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AiServerClient } from './ports/ai-server.client';
import { AgentContextService } from './services/agent-context.service';
import { AgentResponseService } from './services/agent-response.service';
import { AgentToolResultsService } from './services/agent-tool-results.service';
import { ToolTicketService } from './services/tool-ticket.service';

@Module({
  imports: [
    JwtModule.register({}),
    HttpModule,
    ConversationsModule,
    MessagesModule,
    SettingsModule,
    ToolsModule,
    LogsModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentContextService,
    AgentResponseService,
    AgentToolResultsService,
    ToolTicketService,
    { provide: AiServerClient, useClass: HttpAiServerClient },
  ],
})
export class AgentModule {}
