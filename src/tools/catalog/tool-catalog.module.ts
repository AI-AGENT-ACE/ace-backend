import { Module } from '@nestjs/common';
import { ToolCatalog } from './tool-catalog.service';

@Module({ providers: [ToolCatalog], exports: [ToolCatalog] })
export class ToolCatalogModule {}
