import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorResponse } from '../models/publication-search.models';

export function describeManagementError(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Verificá la conexión e intentá nuevamente.';
  }

  if (error.status === 401) {
    return 'No se pudo identificar al usuario. Verificá la identidad local de demostración.';
  }

  if (error.status === 403) {
    return 'No tenés permiso para realizar esta acción.';
  }

  if (error.status === 404) {
    return 'La publicación no existe o no pertenece a tu cuenta.';
  }

  if (error.status === 409) {
    const code = (error.error as ApiErrorResponse | null)?.code;

    if (code === 'PUBLICATION_HAS_ACTIVE_REQUESTS') {
      return 'No se puede cerrar: la publicación tiene solicitudes pendientes o aprobadas. Gestionálas desde «Recibidas».';
    }

    if (code === 'PUBLICATION_NOT_CLOSABLE') {
      return 'Solo se pueden cerrar publicaciones activas.';
    }

    if (code === 'PUBLICATION_NOT_EDITABLE') {
      return 'Solo se pueden editar publicaciones activas.';
    }
  }

  return fallback;
}

export function isActiveRequestsError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 409 &&
    (error.error as ApiErrorResponse | null)?.code ===
      'PUBLICATION_HAS_ACTIVE_REQUESTS'
  );
}
