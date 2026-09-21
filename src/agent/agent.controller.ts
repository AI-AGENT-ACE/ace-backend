import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AgentService } from './agent.service';
import { AgentCloudToolDto, AgentTurnDto, LocalToolResultDto } from './dto/agent.dto';
import { AgentToolResultsService } from './services/agent-tool-results.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Agent')
@ApiBearerAuth()
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly results: AgentToolResultsService,
  ) {}
  @Post('turns')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  turn(@CurrentUser() user: AuthenticatedUser, @Body() input: AgentTurnDto) {
    return this.agent.turn(user.userId, input);
  }
  @Post('tool-results') local(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: LocalToolResultDto,
  ) {
    return this.results.local(user.userId, input);
  }
  @Post('cloud-tools') cloud(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AgentCloudToolDto,
  ) {
    return this.results.cloud(user.userId, input);
  }
}
