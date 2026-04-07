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

  readonly navItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/instructor/dashboard' },
    { label: 'Mis Clases', icon: 'calendar_month', route: '/instructor/mis-clases' },
    { label: 'Marcar Asistencia', icon: 'qr_code_scanner', route: '/instructor/marcar-asistencia' },
    { label: 'Mi Disponibilidad', icon: 'event_busy', route: '/instructor/mi-disponibilidad' },
  ];

  toggleSidenav(): void { this.sidenavOpened.update(v => !v); }
  async logout(): Promise<void> { await this.authService.logout(); }
}
