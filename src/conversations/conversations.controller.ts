import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ResourceIdPipe } from '../common/validation/resource-id.pipe';
import { ConversationsService } from './conversations.service';
import {
  ConversationQueryDto,
  CreateConversationDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateConversationDto) {
    return this.conversations.create(user.userId, input.title);
  }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: ConversationQueryDto) {
    return this.conversations.list(user.userId, query);
  }
  @Get('trash') trash(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConversationQueryDto,
  ) {
    return this.conversations.list(user.userId, query, true);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return this.conversations.active(user.userId, id);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
    @Body() input: UpdateConversationDto,
  ) {
    return this.conversations.update(user.userId, id, input);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ResourceIdPipe) id: string) {
    return this.conversations.softDelete(user.userId, id);
  }
  @Patch(':id/restore') restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return this.conversations.restore(user.userId, id);
  }
  @Delete(':id/permanent')
  @HttpCode(204)
  permanent(@CurrentUser() user: AuthenticatedUser, @Param('id', ResourceIdPipe) id: string) {
    return this.conversations.permanentDelete(user.userId, id);
  }
}
