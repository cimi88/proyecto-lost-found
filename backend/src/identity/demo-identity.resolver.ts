import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { Repository } from 'typeorm';
import { User } from './user.entity';
import type { AuthenticatedUser, CurrentUserResolver } from './identity.types';

const REQUIRED_MESSAGE =
  'X-Demo-User-Id header is required while AUTH_MODE=demo';
const INVALID_MESSAGE =
  'X-Demo-User-Id does not identify an existing demo user';

@Injectable()
export class DemoIdentityResolver implements CurrentUserResolver {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async resolve(request: Request): Promise<AuthenticatedUser> {
    const headerValue = request.header('x-demo-user-id');

    if (!headerValue) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'DEMO_IDENTITY_REQUIRED',
        message: REQUIRED_MESSAGE,
      });
    }

    if (!isUUID(headerValue)) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'DEMO_IDENTITY_INVALID',
        message: INVALID_MESSAGE,
      });
    }

    const user = await this.users.findOne({ where: { id: headerValue } });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'DEMO_IDENTITY_INVALID',
        message: INVALID_MESSAGE,
      });
    }

    return { id: user.id, role: user.role };
  }
}
