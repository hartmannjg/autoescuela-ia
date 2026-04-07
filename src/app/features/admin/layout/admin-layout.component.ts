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
import { MatExpansionModule } from '@angular/material/expansion';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificacionService } from '../../../core/services/notificacion.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule,
    MatButtonModule, MatBadgeModule, MatMenuModule, MatDividerModule, MatExpansionModule,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  private authService = inject(AuthService);
  private notifService = inject(NotificacionService);
  private breakpointObserver = inject(BreakpointObserver);

  readonly user = this.authService.currentUser;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly isMobile = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map(r => r.matches)),
    { initialValue: false }
  );
  readonly sidenavOpened = signal(true);
  readonly notifCount = toSignal(
    this.notifService.noLeidas$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: 0 }
  );

  readonly navItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/admin/dashboard' },
    { label: 'Alumnos', icon: 'people', route: '/admin/alumnos' },
    { label: 'Instructores', icon: 'badge', route: '/admin/instructores' },
    { label: 'Turnos', icon: 'calendar_month', route: '/admin/turnos' },
    { label: 'Reportes', icon: 'bar_chart', route: '/admin/reportes' },
    { label: 'Excepciones', icon: 'warning', route: '/admin/excepciones' },
    { label: 'Ausencias', icon: 'event_busy', route: '/admin/ausencias' },
    { label: 'Feriados', icon: 'beach_access', route: '/admin/feriados' },
    { label: 'Configuración', icon: 'settings', route: '/admin/configuracion' },
  ];

  readonly superAdminItems = [
    { label: 'Sucursales', icon: 'store', route: '/admin/sucursales' },
  ];

  toggleSidenav(): void { this.sidenavOpened.update(v => !v); }
  async logout(): Promise<void> { await this.authService.logout(); }
}
