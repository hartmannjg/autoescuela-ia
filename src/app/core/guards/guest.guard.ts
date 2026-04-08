import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take, switchMap, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Evita que usuarios logueados vean login/register */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      if (!auth.isLoggedIn()) return of(true);
      switch (auth.rol()) {
        case 'alumno': router.navigate(['/alumno/dashboard']); break;
        case 'instructor': router.navigate(['/instructor/dashboard']); break;
        default: router.navigate(['/admin/dashboard']); break;
      }
      return of(false);
    })
  );
};
