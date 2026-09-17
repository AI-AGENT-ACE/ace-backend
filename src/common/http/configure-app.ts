import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { ApiExceptionFilter } from '../errors/api-exception.filter';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const limit = config.getOrThrow<string>('REQUEST_BODY_LIMIT');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header('X-Request-ID');
    response.setHeader(
      'X-Request-ID',
      supplied && /^[a-f0-9-]{36}$/i.test(supplied) ? supplied : randomUUID(),
    );
    next();
  });
  app.use(helmet());
  app.use(json({ limit }));
  app.use(urlencoded({ extended: false, limit }));
  const allowed = config.getOrThrow<string[]>('CORS_ORIGINS');
  app.enableCors({
    origin: allowed,
    credentials: false,
    exposedHeaders: ['X-Request-ID'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const definition = new DocumentBuilder()
      .setTitle('ACE Cloud Backend')
      .setDescription(
        'Account-scoped cloud APIs. Local tools are handed off, never executed by this server.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, definition), {
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
