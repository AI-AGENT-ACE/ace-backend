import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { LogsModule } from '../logs/logs.module';
import { SettingsModule } from '../settings/settings.module';
import { ToolCatalogModule } from './catalog/tool-catalog.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [ToolCatalogModule, SettingsModule, IntegrationsModule, LogsModule],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService, ToolCatalogModule],
})
export class ToolsModule {}
