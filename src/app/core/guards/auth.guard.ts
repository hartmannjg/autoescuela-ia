import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take, switchMap, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Espera a que Firebase termine de restaurar la sesión desde IndexedDB
  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      if (auth.isLoggedIn()) return of(true);
      router.navigate(['/login']);
      return of(false);
    })
  );
};
