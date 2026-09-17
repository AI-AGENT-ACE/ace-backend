import { Injectable } from '@nestjs/common';
import { MessagesService } from '../../messages/messages.service';
import { PermissionsService } from '../../settings/permissions.service';
import { SettingsService } from '../../settings/settings.service';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { PermissionPolicy } from '../../generated/prisma/client';
import { AiToolResult, AiTurnRequest } from '../ports/ai-server.client';

@Injectable()
export class AgentContextService {
  constructor(
    private readonly messages: MessagesService,
    private readonly settings: SettingsService,
    private readonly permissions: PermissionsService,
    private readonly catalog: ToolCatalog,
  ) {}
  async build(
    userId: string,
    conversationId: string,
    toolResults?: AiToolResult[],
  ): Promise<AiTurnRequest> {
    const [history, settings, preferences] = await Promise.all([
      this.messages.list(userId, conversationId, { limit: 30 }),
      this.settings.get(userId),
      this.permissions.list(userId),
    ]);
    const policies = new Map(
      preferences.map((preference) => [preference.toolName, preference.policy]),
    );
    return {
      messages: history.items.reverse().map(({ role, content }) => ({ role, content })),
      responseLanguage: settings.responseLanguage,
      tools: this.catalog
        .list()
        .map(
          ({
            name,
            description,
            executionLocation,
            argumentsSchema,
            systemConfirmation,
            defaultPolicy,
          }) => ({
            name,
            description,
            executionLocation,
            argumentsSchema,
            requiresConfirmation:
              systemConfirmation ||
              (policies.get(name) ?? defaultPolicy) !== PermissionPolicy.ALWAYS_ALLOW,
          }),
        ),
      ...(toolResults ? { toolResults } : {}),
    };
  }
}
