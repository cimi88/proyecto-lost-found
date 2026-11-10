import type { PublicationCategory } from './publication-category';

/**
 * Contrato HTTP v1 — registrar una publicación de objeto encontrado.
 *
 * Endpoint: POST /api/v1/found-publications
 * Identidad local: encabezado X-Demo-User-Id (solo AUTH_MODE=demo).
 *
 * El servidor fija `type=FOUND`, `status=ACTIVE` y `ownerId` a partir del
 * usuario resuelto; esos campos nunca se aceptan en el cuerpo de la solicitud.
 *
 * Se mantiene sincronizado manualmente con:
 * - backend/src/publications/dto/create-publication.dto.ts (base compartida con lost)
 * - backend/src/publications/dto/create-found-publication.dto.ts
 * - backend/src/publications/found-publication-response.ts
 * - frontend/src/app/publications/models/found-publication.models.ts
 */
export interface CreateFoundPublicationRequest {
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

export interface FoundPublicationResponse {
  id: string;
  type: 'FOUND';
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

export const FOUND_PUBLICATIONS_ENDPOINT = '/api/v1/found-publications';
