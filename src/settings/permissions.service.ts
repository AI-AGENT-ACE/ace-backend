import { Injectable } from '@nestjs/common';
import { PermissionPolicy } from '../generated/prisma/client';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { SettingsRepository } from './settings.repository';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly tools: ToolCatalog,
  ) {}
  list(userId: string) {
    return this.settings.permissions(userId);
  }
  async set(userId: string, toolName: string, policy: PermissionPolicy) {
    this.tools.get(toolName);
    const preference = await this.settings.setPermission(userId, toolName, policy);
    return { ...preference, ...(await this.effective(userId, toolName)) };
  }
  async effective(userId: string, toolName: string) {
    const definition = this.tools.get(toolName);
    const preference = await this.settings.permission(userId, toolName);
    const policy = preference?.policy ?? definition.defaultPolicy;
    return {
      policy,
      requiresConfirmation:
        definition.systemConfirmation || policy !== PermissionPolicy.ALWAYS_ALLOW,
      systemConfirmation: definition.systemConfirmation,
    };
  }
}
