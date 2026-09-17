import { Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

export enum AgentEventKind {
  TURN = 'AGENT_TURN',
  TOOL_RESULT = 'AGENT_TOOL_RESULT',
}

@Injectable()
export class AgentEventsService {
  private readonly logger = new Logger(AgentEventsService.name);

  async track<T>(event: AgentEventKind, operation: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      const result = await operation();
      this.logger.log({
        event,
        status: 'SUCCEEDED',
        duration: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      // Never copy exception messages, conversation contents, arguments or tool output into logs.
      this.logger.warn({
        event,
        status: 'FAILED',
        duration: Math.round(performance.now() - started),
      });
      throw error;
    }
  }
}
