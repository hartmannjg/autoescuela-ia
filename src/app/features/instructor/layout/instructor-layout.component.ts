import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificacionService } from '../../../core/services/notificacion.service';
import { Notificacion, TipoNotificacion } from '../../../shared/models';

@Component({
  selector: 'app-instructor-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule,
    MatButtonModule, MatBadgeModule, MatMenuModule, MatDividerModule,
  ],
  templateUrl: './instructor-layout.component.html',
  styleUrl: './instructor-layout.component.scss',
})
export class InstructorLayoutComponent {
  private authService = inject(AuthService);
  private notifService = inject(NotificacionService);
  private breakpointObserver = inject(BreakpointObserver);

  readonly user = this.authService.currentUser;
  readonly isMobile = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map(r => r.matches)),
    { initialValue: false }
  );
  readonly sidenavOpened = signal(true);
  readonly notifCount = toSignal(
    this.notifService.noLeidas$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: 0 }
  );
  readonly notificaciones = toSignal(
    this.notifService.notificaciones$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] as Notificacion[] }
  );

  async marcarLeida(notif: Notificacion): Promise<void> {
    if (!notif.leida && notif.id) await this.notifService.marcarLeida(notif.id);
  }
  async marcarTodasLeidas(): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (uid) await this.notifService.marcarTodasLeidas(uid);
  }
  iconoNotif(tipo: TipoNotificacion): string {
    const map: Record<TipoNotificacion, string> = {
      confirmacion_turno: 'check_circle', rechazo_turno: 'cancel',
      recordatorio_turno: 'schedule',     nueva_solicitud: 'pending_actions',
      bloqueo_cuenta: 'block',            desbloqueo_cuenta: 'lock_open',
      feedback_recibido: 'star',          clase_completada: 'school',
      saldo_bajo: 'warning',              plan_vencimiento: 'event_busy',
    };
    return map[tipo] ?? 'notifications';
  }

  readonly navItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/instructor/dashboard' },
    { label: 'Mis Clases', icon: 'calendar_month', route: '/instructor/mis-clases' },
    { label: 'Marcar Asistencia', icon: 'qr_code_scanner', route: '/instructor/marcar-asistencia' },
    { label: 'Mi Disponibilidad', icon: 'event_busy', route: '/instructor/mi-disponibilidad' },
  ];

  toggleSidenav(): void { this.sidenavOpened.update(v => !v); }
  async logout(): Promise<void> { await this.authService.logout(); }
}
