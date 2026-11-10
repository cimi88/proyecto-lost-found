import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  CreateFoundPublicationRequest,
  FoundPublicationResponse,
} from '../models/found-publication.models';

@Injectable({ providedIn: 'root' })
export class FoundPublicationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/found-publications`;

  createFoundPublication(
    request: CreateFoundPublicationRequest,
  ): Observable<FoundPublicationResponse> {
    return this.http.post<FoundPublicationResponse>(this.baseUrl, request);
  }
}
