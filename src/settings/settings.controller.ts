import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UpdatePermissionDto, UpdateSettingsDto } from './dto/settings.dto';
import { PermissionsService } from './permissions.service';
import { SettingsService } from './settings.service';

@ApiTags('Cloud settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly permissions: PermissionsService,
  ) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.userId);
  }
  @Patch() update(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateSettingsDto) {
    return this.settings.update(user.userId, input);
  }
  @Get('permissions') list(@CurrentUser() user: AuthenticatedUser) {
    return this.permissions.list(user.userId);
  }
  @Put('permissions/:toolName') permission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('toolName') name: string,
    @Body() input: UpdatePermissionDto,
  ) {
    return this.permissions.set(user.userId, name, input.policy);
  }
}
