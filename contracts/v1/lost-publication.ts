import type { PublicationCategory } from './publication-category';

/**
 * Contrato HTTP v1 — registrar una publicación de objeto perdido.
 *
 * Endpoint: POST /api/v1/lost-publications
 * Identidad local: encabezado X-Demo-User-Id (solo AUTH_MODE=demo).
 *
 * Se mantiene sincronizado manualmente con:
 * - backend/src/publications/dto/create-publication.dto.ts (base compartida con found)
 * - backend/src/publications/dto/create-lost-publication.dto.ts
 * - backend/src/publications/lost-publication-response.ts
 * - frontend/src/app/publications/models/lost-publication.models.ts
 */
export interface CreateLostPublicationRequest {
  /** Entre 3 y 120 caracteres, sin espacios al inicio ni al final. */
  title: string;
  /** Entre 10 y 1000 caracteres, sin espacios al inicio ni al final. */
  description: string;
  category: PublicationCategory;
  /** Entre 3 y 120 caracteres, sin espacios al inicio ni al final. */
  location: string;
  /** Fecha calendario en formato YYYY-MM-DD; no puede ser futura. */
  eventDate: string;
}

export interface LostPublicationResponse {
  id: string;
  type: 'LOST';
  status: 'ACTIVE';
  ownerId: string;
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  code:
    | 'VALIDATION_ERROR'
    | 'DEMO_IDENTITY_REQUIRED'
    | 'DEMO_IDENTITY_INVALID'
    | 'INTERNAL_ERROR'
    | (string & {});
  message: string;
  details?: ApiErrorDetail[];
}

export const LOST_PUBLICATIONS_ENDPOINT = '/api/v1/lost-publications';
