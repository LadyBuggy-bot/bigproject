import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const res = ctx.getResponse<Response>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;
    if (error instanceof HttpException) {
      status = error.getStatus();
      const value = error.getResponse();
      const text =
        typeof value === 'string' ? value : (value as { message?: string | string[] }).message;
      message = Array.isArray(text) ? 'Validation failed' : (text ?? error.message);
      if (Array.isArray(text)) details = text;
      code =
        (
          {
            400: 'VALIDATION_ERROR',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            413: 'PAYLOAD_TOO_LARGE',
            415: 'UNSUPPORTED_MEDIA_TYPE',
            429: 'RATE_LIMITED',
            503: 'SERVICE_UNAVAILABLE',
          } as Record<number, string>
        )[status] ?? 'REQUEST_ERROR';
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Record not found';
      }
      if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
        status = 409;
        code = 'CONFLICT';
        message = 'Change conflicts with current data; refresh and retry';
      }
    }
    const requestId = req.requestId ?? randomUUID();
    if (status >= 500)
      this.logger.error(`${requestId}: ${error instanceof Error ? error.name : 'Unknown error'}`);
    res.setHeader('X-Request-Id', requestId);
    res
      .status(status)
      .json({ error: { code, message, ...(details ? { details } : {}), requestId } });
  }
}
