import type { PublicationCategory } from '../domain/publication-category';
import type { PublicationDetail } from './publication-search.models';

export type OwnPublication = PublicationDetail;

export interface UpdatePublicationRequest {
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
}
