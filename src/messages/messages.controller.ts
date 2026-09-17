import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PageQueryDto } from '../common/pagination/page.dto';
import { ResourceIdPipe } from '../common/validation/resource-id.pipe';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('conversations/:id/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
    @Query() query: PageQueryDto,
  ) {
    return this.messages.list(user.userId, id, query);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
    @Body() input: CreateMessageDto,
  ) {
    return this.messages.append(user.userId, id, input.role, input.content);
  }
}
