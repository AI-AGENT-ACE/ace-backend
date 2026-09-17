import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/http/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, abortOnError: false });
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'), config.getOrThrow<string>('HOST'));
  new Logger('Bootstrap').log(`ACE backend listening on port ${config.getOrThrow<number>('PORT')}`);
}

void bootstrap().catch(() => {
  new Logger('Bootstrap').error(
    'ACE backend could not start. Verify environment, PostgreSQL connection and migrations.',
  );
  process.exit(1);
});
