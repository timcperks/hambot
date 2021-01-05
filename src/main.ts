import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLogger } from './modules/logger/logger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      pluginTimeout: 30000,
    }),
  );
  const configService = app.get(ConfigService);
  const port = configService.get('PORT');
  const logger = await app.resolve(AppLogger);
  const fastify: FastifyAdapter = app.getHttpAdapter().getInstance();

  app.enableShutdownHooks();

  await fastify.register(import('fastify-nextjs'));
  (fastify as any).next('/');
  (fastify as any).next('/clipper');
  logger.verbose('SSR Server Started');
  await app.listen(port ?? 3000);
  logger.verbose('Listening to ' + (port ?? 3000));
}
bootstrap();
