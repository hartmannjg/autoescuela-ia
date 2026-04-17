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

/** Admin guard: admin/super-admin allowed; super-admin without sucursal → /admin/setup */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      const user = auth.currentUser();
      if (!user || (user.rol !== 'admin' && user.rol !== 'super-admin')) {
        router.navigate(['/login']);
        return of(false);
      }
      if (user.rol === 'super-admin' && !user.sucursalId) {
        router.navigate(['/admin/setup']);
        return of(false);
      }
      return of(true);
    })
  );
};

/** Setup guard: only super-admin can access the setup/switch-sucursal page */
export const superAdminSetupGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      const user = auth.currentUser();
      if (!user || user.rol !== 'super-admin') {
        router.navigate(['/login']);
        return of(false);
      }
      return of(true);
    })
  );
};

export const superAdminGuard: CanActivateFn = roleGuard(['super-admin']);
