import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
    allowedHeaders: ['Content-Type', 'X-Demo-User-Id'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  await app.listen(port);
}
void bootstrap();
