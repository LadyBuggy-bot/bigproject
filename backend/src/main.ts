import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // DEVELOPMENT.md п. 16: базовый URL /api/v1
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Валидация входящих DTO. whitelist отсекает поля, которых нет в DTO,
  // forbidNonWhitelisted возвращает ошибку вместо тихого игнорирования —
  // иначе опечатка в имени поля выглядит как успешный запрос.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ARCHITECTURE.md п. 27: Swagger формируется из кода
  const config = new DocumentBuilder()
    .setTitle('BigProject API')
    .setDescription('Корпоративная CRM с встроенным мессенджером и ИИ-помощником')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.APP_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
