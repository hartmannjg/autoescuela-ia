import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import Swal from 'sweetalert2';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let mensaje = 'Ocurrió un error inesperado.';

      if (error.status === 401) {
        mensaje = 'Tu sesión expiró. Por favor iniciá sesión nuevamente.';
        router.navigate(['/login']);
      } else if (error.status === 403) {
        mensaje = 'No tenés permisos para realizar esta acción.';
      } else if (error.status === 404) {
        mensaje = 'El recurso solicitado no existe.';
      } else if (error.status === 0) {
        mensaje = 'Sin conexión a internet. Verificá tu conexión.';
      } else if (error.error?.message) {
        mensaje = error.error.message;
      }

      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: mensaje,
        confirmButtonColor: '#1a237e',
      });

      return throwError(() => error);
    })
  );
};
