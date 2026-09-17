import { Injectable } from '@nestjs/common';
import { CloudToolHandler } from './ports/cloud-tool.handler';

@Injectable()
export class IntegrationRegistry {
  private readonly handlers = new Map<string, CloudToolHandler>();
  register(handler: CloudToolHandler) {
    if (this.handlers.has(handler.toolName)) throw new Error('Duplicate cloud tool handler');
    this.handlers.set(handler.toolName, handler);
  }
  find(toolName: string) {
    return this.handlers.get(toolName);
  }
}
