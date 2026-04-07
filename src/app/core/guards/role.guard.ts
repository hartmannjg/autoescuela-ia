import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../../shared/models';

export const roleGuard = (roles: UserRole[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const rol = auth.rol();
  if (!rol || !roles.includes(rol)) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

export const alumnoGuard: CanActivateFn = roleGuard(['alumno']);
export const instructorGuard: CanActivateFn = roleGuard(['instructor']);
export const adminGuard: CanActivateFn = roleGuard(['admin', 'super-admin']);
export const superAdminGuard: CanActivateFn = roleGuard(['super-admin']);
