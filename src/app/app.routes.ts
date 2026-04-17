import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { alumnoGuard, instructorGuard, adminGuard, superAdminSetupGuard } from './core/guards/role.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Auth
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
  },
  { path: 'register', redirectTo: 'login', pathMatch: 'full' },

  // Super Admin setup (select/create sucursal on first login)
  {
    path: 'admin/setup',
    loadComponent: () => import('./features/admin/setup/admin-setup.component').then(m => m.AdminSetupComponent),
    canActivate: [authGuard, superAdminSetupGuard],
  },

  // Alumno
  {
    path: 'alumno',
    loadComponent: () => import('./features/alumno/layout/alumno-layout.component').then(m => m.AlumnoLayoutComponent),
    canActivate: [authGuard, alumnoGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/alumno/dashboard/dashboard.component').then(m => m.AlumnoDashboardComponent) },
      { path: 'calendario', loadComponent: () => import('./features/alumno/calendario/calendario.component').then(m => m.AlumnoCalendarioComponent) },
      { path: 'asignacion-masiva', loadComponent: () => import('./features/alumno/asignacion-masiva/asignacion-masiva.component').then(m => m.AsignacionMasivaComponent) },
      { path: 'mis-turnos', loadComponent: () => import('./features/alumno/mis-turnos/mis-turnos.component').then(m => m.MisTurnosComponent) },
      { path: 'mi-saldo', loadComponent: () => import('./features/alumno/mi-saldo/mi-saldo.component').then(m => m.MiSaldoComponent) },
      { path: 'historial', loadComponent: () => import('./features/alumno/historial/historial.component').then(m => m.HistorialComponent) },
      { path: 'escanear-qr', loadComponent: () => import('./features/alumno/escanear-qr/escanear-qr.component').then(m => m.EscanearQrComponent) },
      { path: 'feedback', loadComponent: () => import('./features/alumno/feedback/feedback.component').then(m => m.FeedbackComponent) },
    ],
  },

  // Instructor
  {
    path: 'instructor',
    loadComponent: () => import('./features/instructor/layout/instructor-layout.component').then(m => m.InstructorLayoutComponent),
    canActivate: [authGuard, instructorGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/instructor/dashboard/dashboard.component').then(m => m.InstructorDashboardComponent) },
      { path: 'mis-clases', loadComponent: () => import('./features/instructor/mis-clases/mis-clases.component').then(m => m.MisClasesComponent) },
      { path: 'marcar-asistencia', loadComponent: () => import('./features/instructor/marcar-asistencia/marcar-asistencia.component').then(m => m.MarcarAsistenciaComponent) },
      { path: 'evaluar-alumno/:turnoId', loadComponent: () => import('./features/instructor/evaluar-alumno/evaluar-alumno.component').then(m => m.EvaluarAlumnoComponent) },
      { path: 'mi-disponibilidad', loadComponent: () => import('./features/instructor/mi-disponibilidad/mi-disponibilidad.component').then(m => m.MiDisponibilidadComponent) },
    ],
  },

  // Admin
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/dashboard/dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'alumnos', loadComponent: () => import('./features/admin/alumnos/alumnos.component').then(m => m.AlumnosComponent) },
      { path: 'alumnos/:id', loadComponent: () => import('./features/admin/alumnos/alumno-detalle.component').then(m => m.AlumnoDetalleComponent) },
      { path: 'instructores', loadComponent: () => import('./features/admin/instructores/instructores.component').then(m => m.InstructoresComponent) },
      { path: 'instructores/:id', loadComponent: () => import('./features/admin/instructores/instructor-detalle.component').then(m => m.InstructorDetalleComponent) },
      { path: 'turnos', loadComponent: () => import('./features/admin/turnos/turnos.component').then(m => m.AdminTurnosComponent) },
      { path: 'agenda-alumno', loadComponent: () => import('./features/admin/agenda-alumno/agenda-alumno.component').then(m => m.AgendaAlumnoComponent) },
      { path: 'reportes', loadComponent: () => import('./features/admin/reportes/reportes.component').then(m => m.ReportesComponent) },
      { path: 'excepciones', loadComponent: () => import('./features/admin/excepciones/excepciones.component').then(m => m.ExcepcionesComponent) },
      { path: 'sucursales', loadComponent: () => import('./features/admin/sucursales/sucursales.component').then(m => m.SucursalesComponent) },
      { path: 'administradores', loadComponent: () => import('./features/admin/administradores/administradores.component').then(m => m.AdministradoresComponent) },
      { path: 'feriados', loadComponent: () => import('./features/admin/feriados/feriados.component').then(m => m.FeriadosComponent) },
      { path: 'ausencias', loadComponent: () => import('./features/admin/ausencias/ausencias.component').then(m => m.AusenciasComponent) },
      { path: 'configuracion', loadComponent: () => import('./features/admin/configuracion/configuracion.component').then(m => m.ConfiguracionComponent) },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
