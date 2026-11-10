import type { Request } from 'express';
import type { UserRole } from './user-role';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface CurrentUserResolver {
  resolve(request: Request): Promise<AuthenticatedUser>;
}

export const CURRENT_USER_RESOLVER = Symbol('CURRENT_USER_RESOLVER');
