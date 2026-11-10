import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './identity.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
    }>();
    return request.user;
  },
);
