import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  CreateLostPublicationRequest,
  LostPublicationResponse,
} from '../models/lost-publication.models';

@Injectable({ providedIn: 'root' })
export class LostPublicationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/lost-publications`;

  createLostPublication(
    request: CreateLostPublicationRequest,
  ): Observable<LostPublicationResponse> {
    return this.http.post<LostPublicationResponse>(this.baseUrl, request);
  }
}
