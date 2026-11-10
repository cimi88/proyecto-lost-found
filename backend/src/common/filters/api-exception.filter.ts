import {
  Catch,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

interface ApiErrorPayload {
  statusCode?: number;
  code: string;
  message: string;
  details?: unknown;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    default:
      return 'HTTP_ERROR';
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (isApiErrorPayload(payload)) {
        response.status(status).json({
          statusCode: status,
          code: payload.code,
          message: payload.message,
          ...(payload.details === undefined
            ? {}
            : { details: payload.details }),
        });
        return;
      }

      const message =
        typeof payload === 'string'
          ? payload
          : this.extractMessage(payload);

      response.status(status).json({
        statusCode: status,
        code: defaultCodeFor(status),
        message,
      });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }

  private extractMessage(payload: object): string {
    const message = (payload as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return 'Invalid request data';
    }

    return typeof message === 'string' ? message : 'Request failed';
  }
}
