export const USER_ROLES = ['USER', 'ADMIN'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}
