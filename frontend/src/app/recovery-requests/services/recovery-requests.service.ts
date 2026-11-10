import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  CancelRecoveryRequest,
  CompleteRecoveryRequest,
  CreateRecoveryRequest,
  RecoveryRequest,
} from '../models/recovery-request.models';

@Injectable({ providedIn: 'root' })
export class RecoveryRequestsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1`;

  create(
    publicationId: string,
    body: CreateRecoveryRequest,
  ): Observable<RecoveryRequest> {
    return this.http.post<RecoveryRequest>(
      `${this.baseUrl}/publications/${encodeURIComponent(publicationId)}/recovery-requests`,
      body,
    );
  }

  getMine(): Observable<RecoveryRequest[]> {
    return this.http.get<RecoveryRequest[]>(
      `${this.baseUrl}/recovery-requests/mine`,
    );
  }

  getReceived(): Observable<RecoveryRequest[]> {
    return this.http.get<RecoveryRequest[]>(
      `${this.baseUrl}/recovery-requests/received`,
    );
  }

  approve(id: string): Observable<RecoveryRequest> {
    return this.http.post<RecoveryRequest>(
      `${this.baseUrl}/recovery-requests/${encodeURIComponent(id)}/approve`,
      {},
    );
  }

  reject(id: string): Observable<RecoveryRequest> {
    return this.http.post<RecoveryRequest>(
      `${this.baseUrl}/recovery-requests/${encodeURIComponent(id)}/reject`,
      {},
    );
  }

  complete(
    id: string,
    body: CompleteRecoveryRequest,
  ): Observable<RecoveryRequest> {
    return this.http.post<RecoveryRequest>(
      `${this.baseUrl}/recovery-requests/${encodeURIComponent(id)}/complete`,
      body,
    );
  }

  cancel(
    id: string,
    body: CancelRecoveryRequest,
  ): Observable<RecoveryRequest> {
    return this.http.post<RecoveryRequest>(
      `${this.baseUrl}/recovery-requests/${encodeURIComponent(id)}/cancel`,
      body,
    );
  }
}
