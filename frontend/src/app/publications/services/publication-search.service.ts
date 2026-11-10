import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  PublicationDetail,
  PublicationSearchParams,
  PublicationSearchResponse,
} from '../models/publication-search.models';

@Injectable({ providedIn: 'root' })
export class PublicationSearchService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/publications`;

  search({
    q,
    type,
    category,
    eventDateFrom,
    eventDateTo,
    sort,
    page,
    pageSize,
  }: PublicationSearchParams): Observable<PublicationSearchResponse> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));

    const term = q?.trim();

    if (term) {
      params = params.set('q', term);
    }

    if (type) {
      params = params.set('type', type);
    }

    if (category) {
      params = params.set('category', category);
    }

    if (eventDateFrom) {
      params = params.set('eventDateFrom', eventDateFrom);
    }

    if (eventDateTo) {
      params = params.set('eventDateTo', eventDateTo);
    }

    if (sort && sort !== 'recent') {
      params = params.set('sort', sort);
    }

    return this.http.get<PublicationSearchResponse>(this.baseUrl, { params });
  }

  getById(id: string): Observable<PublicationDetail> {
    return this.http.get<PublicationDetail>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
    );
  }
}
