import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Repository } from 'typeorm';
import { DemoIdentityResolver } from './demo-identity.resolver';
import type { User } from './user.entity';

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

function requestWith(headerValue?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'x-demo-user-id' ? headerValue : undefined,
  } as unknown as Request;
}

function repositoryWith(user: Pick<User, 'id' | 'role'> | null): Repository<User> {
  return {
    findOne: jest.fn(async () => user),
  } as unknown as Repository<User>;
}

async function captureUnauthorized(
  promise: Promise<unknown>,
): Promise<UnauthorizedException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return error as UnauthorizedException;
  }

  throw new Error('Expected an UnauthorizedException');
}

describe('DemoIdentityResolver', () => {
  it('requires the X-Demo-User-Id header', async () => {
    const resolver = new DemoIdentityResolver(repositoryWith(null));
    const exception = await captureUnauthorized(
      resolver.resolve(requestWith()),
    );

    expect(exception.getResponse()).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_REQUIRED',
    });
  });

  it('rejects a header that is not a UUID without querying the repository', async () => {
    const repository = repositoryWith(null);
    const resolver = new DemoIdentityResolver(repository);
    const exception = await captureUnauthorized(
      resolver.resolve(requestWith('demo-user')),
    );

    expect(exception.getResponse()).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_INVALID',
    });
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a well-formed UUID that does not exist', async () => {
    const resolver = new DemoIdentityResolver(repositoryWith(null));
    const exception = await captureUnauthorized(
      resolver.resolve(requestWith(DEMO_USER_ID)),
    );

    expect(exception.getResponse()).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_INVALID',
    });
  });

  it('returns the resolved identity for an existing user', async () => {
    const resolver = new DemoIdentityResolver(
      repositoryWith({ id: DEMO_USER_ID, role: 'USER' }),
    );

    await expect(resolver.resolve(requestWith(DEMO_USER_ID))).resolves.toEqual({
      id: DEMO_USER_ID,
      role: 'USER',
    });
  });
});
