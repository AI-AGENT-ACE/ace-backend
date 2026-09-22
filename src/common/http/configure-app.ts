import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { ApiExceptionFilter } from '../errors/api-exception.filter';
import { writeOperationalLog } from '../logging/operational-logger';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const limit = config.getOrThrow<string>('REQUEST_BODY_LIMIT');
  const trustProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustProxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header('X-Request-ID');
    response.setHeader(
      'X-Request-ID',
      supplied && /^[a-f0-9-]{36}$/i.test(supplied) ? supplied : randomUUID(),
    );
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const started = performance.now();
    response.on('finish', () => {
      const status = response.statusCode;
      writeOperationalLog({
        timestamp: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        service: 'ace-backend',
        requestId: String(response.getHeader('X-Request-ID') ?? ''),
        method: request.method,
        route: request.route?.path
          ? `${request.baseUrl}${String(request.route.path)}`
          : request.path,
        status,
        duration: Math.round(performance.now() - started),
        errorCode: response.locals.errorCode,
      });
    });
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
