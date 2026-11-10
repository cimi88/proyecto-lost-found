import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistantModule } from './assistant/assistant.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { flattenValidationErrors } from './common/validation/flatten-validation-errors';
import configuration from './config/configuration';
import { buildDataSourceOptions } from './config/database.config';
import { validateRuntimeEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PublicationsModule } from './publications/publications.module';
import { RecoveryRequestsModule } from './recovery-requests/recovery-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validate: validateRuntimeEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');

        if (!databaseUrl) {
          throw new Error('DATABASE_URL is required');
        }

        return buildDataSourceOptions(databaseUrl);
      },
    }),
    HealthModule,
    IdentityModule,
    AssistantModule,
    PublicationsModule,
    RecoveryRequestsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: flattenValidationErrors(errors),
          }),
      }),
    },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
