/**
 * Contrato HTTP v1 — identidad de la interfaz.
 *
 * Endpoint:
 * - GET /api/v1/me
 *
 * Requiere X-Demo-User-Id mientras AUTH_MODE=demo. La respuesta expone
 * únicamente el rol de la identidad resuelta; no incluye id, correo ni datos
 * personales.
 *
 * Se mantiene sincronizado manualmente con:
 * - backend/src/identity/me-response.ts
 * - backend/src/identity/me.controller.ts
 * - frontend/src/app/core/identity.models.ts
 */
export const USER_ROLES = ['USER', 'ADMIN'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface MeResponse {
  role: UserRole;
}

export type IdentityErrorCode =
  | 'DEMO_IDENTITY_REQUIRED'
  | 'DEMO_IDENTITY_INVALID';

export interface IdentityError {
  statusCode: 401;
  code: IdentityErrorCode;
  message: string;
}

export const ME_ENDPOINT = '/api/v1/me';
