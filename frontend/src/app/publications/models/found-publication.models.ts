import type { PublicationCategory } from '../domain/publication-category';

export interface CreateFoundPublicationRequest {
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
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
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}
