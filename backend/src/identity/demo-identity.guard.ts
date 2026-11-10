import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  CURRENT_USER_RESOLVER,
  type AuthenticatedUser,
  type CurrentUserResolver,
} from './identity.types';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class DemoIdentityGuard implements CanActivate {
  constructor(
    @Inject(CURRENT_USER_RESOLVER)
    private readonly resolver: CurrentUserResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    request.user = await this.resolver.resolve(request);
    return true;
  }
}
