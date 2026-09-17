import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PageQueryDto } from '../common/pagination/page.dto';
import { LogsService } from './logs.service';

@ApiTags('Tool logs')
@ApiBearerAuth()
@Controller('logs/tools')
export class LogsController {
  constructor(private readonly logs: LogsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQueryDto) {
    return this.logs.list(user.userId, query);
  }
}
