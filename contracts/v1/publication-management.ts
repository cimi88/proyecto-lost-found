import type { PublicationCategory } from './publication-category';

/**
 * Contrato HTTP v1 — gestión de publicaciones propias.
 *
 * Endpoints:
 * - GET /api/v1/publications/mine
 * - GET /api/v1/publications/mine/:id
 * - PUT /api/v1/publications/:id
 * - POST /api/v1/publications/:id/close
 * - GET /api/v1/admin/publications
 *
 * Todos requieren X-Demo-User-Id mientras AUTH_MODE=demo. Las respuestas no
 * exponen ownerId. La edición se autoriza por propiedad y estado ACTIVE. El
 * cierre se autoriza por propiedad o por ADMIN moderador sobre una publicación
 * ACTIVE ajena. El listado ADMIN excluye las publicaciones propias.
 */
export type OwnPublicationType = 'LOST' | 'FOUND';

export type OwnPublicationStatus =
  | 'ACTIVE'
  | 'RESERVED'
  | 'RETURNED'
  | 'CLOSED';

export interface OwnPublication {
  id: string;
  type: OwnPublicationType;
  status: OwnPublicationStatus;
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateOwnPublication {
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
}

export type PublicationManagementErrorCode =
  | 'VALIDATION_ERROR'
  | 'DEMO_IDENTITY_REQUIRED'
  | 'DEMO_IDENTITY_INVALID'
  | 'ADMIN_FORBIDDEN'
  | 'PUBLICATION_NOT_FOUND'
  | 'PUBLICATION_NOT_EDITABLE'
  | 'PUBLICATION_NOT_CLOSABLE'
  | 'PUBLICATION_HAS_ACTIVE_REQUESTS';

export interface PublicationManagementError {
  statusCode: number;
  code: PublicationManagementErrorCode;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export const PUBLICATIONS_MINE_ENDPOINT = '/api/v1/publications/mine';
export const PUBLICATION_MINE_DETAIL_ENDPOINT =
  '/api/v1/publications/mine/:id';
export const PUBLICATION_UPDATE_ENDPOINT = '/api/v1/publications/:id';
export const PUBLICATION_CLOSE_ENDPOINT =
  '/api/v1/publications/:id/close';
export const ADMIN_PUBLICATIONS_ENDPOINT = '/api/v1/admin/publications';
