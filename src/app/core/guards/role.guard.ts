import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take, switchMap, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../../shared/models';

export const roleGuard = (roles: UserRole[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      const rol = auth.rol();
      if (rol && roles.includes(rol)) return of(true);
      router.navigate(['/login']);
      return of(false);
    })
  );
};

export const alumnoGuard: CanActivateFn = roleGuard(['alumno']);
export const instructorGuard: CanActivateFn = roleGuard(['instructor']);
export const adminGuard: CanActivateFn = roleGuard(['admin', 'super-admin']);
export const superAdminGuard: CanActivateFn = roleGuard(['super-admin']);
