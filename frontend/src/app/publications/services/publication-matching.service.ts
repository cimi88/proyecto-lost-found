import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PublicationMatchesResponse } from '../models/publication-matching.models';

@Injectable({ providedIn: 'root' })
export class PublicationMatchingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/publications`;

  getSuggestions(id: string): Observable<PublicationMatchesResponse> {
    return this.http.get<PublicationMatchesResponse>(
      `${this.baseUrl}/${encodeURIComponent(id)}/matches`,
    );
  }
}
