import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security
  app.use(helmet({
    contentSecurityPolicy: false, // disabled so Socket.IO works
    crossOriginEmbedderPolicy: false,
  }));

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
    ],
    credentials: true,
  });

  // Global prefix — must match frontend's axios baseURL (/api/v1)
  app.setGlobalPrefix('api/v1');

  // Global pipes
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // Health check — outside global prefix so nginx /health probe works
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', async (req: any, res: any) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  await app.listen(process.env.PORT || 3000);
  console.log('API running on port ' + (process.env.PORT || 3000));
}
bootstrap();
