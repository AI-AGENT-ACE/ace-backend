import { Module } from '@nestjs/common';
import { JsonHttpClient } from './json-http.client';

@Module({ providers: [JsonHttpClient], exports: [JsonHttpClient] })
export class HttpModule {}
