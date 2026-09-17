import { Module } from '@nestjs/common';
import { IntegrationRegistry } from './integration-registry.service';

@Module({ providers: [IntegrationRegistry], exports: [IntegrationRegistry] })
export class IntegrationsModule {}
