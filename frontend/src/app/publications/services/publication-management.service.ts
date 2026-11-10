import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  OwnPublication,
  UpdatePublicationRequest,
} from '../models/publication-management.models';

@Injectable({ providedIn: 'root' })
export class PublicationManagementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/publications`;
  private readonly adminUrl = `${environment.apiBaseUrl}/v1/admin/publications`;

  getMine(): Observable<OwnPublication[]> {
    return this.http.get<OwnPublication[]>(`${this.baseUrl}/mine`);
  }

  getForModeration(): Observable<OwnPublication[]> {
    return this.http.get<OwnPublication[]>(this.adminUrl);
  }

  getMineById(id: string): Observable<OwnPublication> {
    return this.http.get<OwnPublication>(
      `${this.baseUrl}/mine/${encodeURIComponent(id)}`,
    );
  }

  update(
    id: string,
    body: UpdatePublicationRequest,
  ): Observable<OwnPublication> {
    return this.http.put<OwnPublication>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      body,
    );
  }

  close(id: string): Observable<OwnPublication> {
    return this.http.post<OwnPublication>(
      `${this.baseUrl}/${encodeURIComponent(id)}/close`,
      {},
    );
  }
}
