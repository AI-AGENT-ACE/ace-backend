import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { ToolsService } from './tools.service';

@ApiTags('Tools')
@ApiBearerAuth()
@Controller('tools')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}
  @Get() catalog() {
    return this.tools.list();
  }
  @Post('execute') execute(@CurrentUser() user: AuthenticatedUser, @Body() input: ExecuteToolDto) {
    return this.tools.execute(user.userId, input);
  }
}
