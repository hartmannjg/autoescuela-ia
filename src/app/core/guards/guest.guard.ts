import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Evita que usuarios logueados vean login/register */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;

  const rol = auth.rol();
  switch (rol) {
    case 'alumno': router.navigate(['/alumno/dashboard']); break;
    case 'instructor': router.navigate(['/instructor/dashboard']); break;
    default: router.navigate(['/admin/dashboard']); break;
  }
  return false;
};
