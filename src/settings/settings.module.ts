import { Module } from '@nestjs/common';
import { ToolCatalogModule } from '../tools/catalog/tool-catalog.module';
import { PermissionsService } from './permissions.service';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  imports: [ToolCatalogModule],
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsService, PermissionsService],
  exports: [SettingsService, PermissionsService],
})
export class SettingsModule {}
