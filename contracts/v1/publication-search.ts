import type { PublicationCategory } from './publication-category';

/**
 * Contrato HTTP v1 — consultar publicaciones activas.
 *
 * Endpoints:
 * - GET /api/v1/publications      (listado, búsqueda, filtros y orden paginados)
 * - GET /api/v1/publications/:id  (detalle)
 *
 * Lectura pública: no requiere X-Demo-User-Id.
 *
 * Solo se exponen publicaciones con `status=ACTIVE`. `status` no es un
 * parámetro aceptado; los filtros y el término `q` se combinan con AND.
 * `ownerId`, datos de contacto e información del usuario no forman parte de
 * las respuestas de lectura. El detalle devuelve id, type, status, title,
 * description, category, location, eventDate, createdAt y updatedAt mediante
 * una proyección limitada a columnas públicas. Un identificador inexistente o
 * no activo responde 404 con `code=PUBLICATION_NOT_FOUND`.
 *
 * Se mantiene sincronizado manualmente con:
 * - backend/src/publications/dto/publication-query.dto.ts
 * - backend/src/publications/publication-read-response.ts
 * - backend/src/publications/publications-read.controller.ts
 * - frontend/src/app/publications/models/publication-search.models.ts
 */
export type PublicationType = 'LOST' | 'FOUND';

export interface PublicationSummary {
  id: string;
  type: PublicationType;
  status: 'ACTIVE';
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
}

export interface PublicationDetail extends PublicationSummary {
  updatedAt: string;
}

export type PublicationSort = 'recent' | 'oldest' | 'relevance';

export interface PublicationSearchQuery {
  /** Término opcional de 1 a 100 caracteres; vacío equivale a explorar. */
  q?: string;
  /** Filtra por tipo de publicación. */
  type?: PublicationType;
  /** Filtra por una de las nueve categorías. */
  category?: PublicationCategory;
  /** Fecha inclusiva mínima del hecho, en formato YYYY-MM-DD. */
  eventDateFrom?: string;
  /** Fecha inclusiva máxima del hecho, en formato YYYY-MM-DD. */
  eventDateTo?: string;
  /**
   * `recent` (predeterminado), `oldest` o `relevance`.
   * `relevance` requiere un `q` no vacío; si falta responde 400
   * `VALIDATION_ERROR` con detalle en `sort`.
   */
  sort?: PublicationSort;
  /** Entero mayor o igual a 1. Predeterminado: 1. */
  page?: number;
  /** Entero entre 1 y 50. Predeterminado: 12. */
  pageSize?: number;
}

export interface PublicationSearchResponse {
  items: PublicationSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  code:
    | 'VALIDATION_ERROR'
    | 'PUBLICATION_NOT_FOUND'
    | 'INTERNAL_ERROR'
    | (string & {});
  message: string;
  details?: ApiErrorDetail[];
}

export const PUBLICATIONS_ENDPOINT = '/api/v1/publications';
export const PUBLICATION_DETAIL_ENDPOINT = '/api/v1/publications/:id';
export const DEFAULT_PUBLICATION_PAGE = 1;
export const DEFAULT_PUBLICATION_PAGE_SIZE = 12;
export const MAX_PUBLICATION_PAGE_SIZE = 50;
export const DEFAULT_PUBLICATION_SORT: PublicationSort = 'recent';
export const PUBLICATION_SORTS = ['recent', 'oldest', 'relevance'] as const;
export const PUBLICATION_SEARCH_SIMILARITY_THRESHOLD = 0.15;
