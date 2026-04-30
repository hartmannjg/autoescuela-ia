import { Component, inject, signal, OnInit } from '@angular/core';
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
import { SucursalService } from '../../../core/services/sucursal.service';
import { TurnoService } from '../../../core/services/turno.service';
import { AutoService } from '../../../core/services/auto.service';
import { Notificacion, TipoNotificacion, Sucursal } from '../../../shared/models';

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
export class AdminLayoutComponent implements OnInit {
  private authService = inject(AuthService);
  private notifService = inject(NotificacionService);
  private sucursalService = inject(SucursalService);
  private turnoService = inject(TurnoService);
  private autoService = inject(AutoService);
  private breakpointObserver = inject(BreakpointObserver);

  readonly user = this.authService.currentUser;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly sucursalActual = signal<Sucursal | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.user()?.sucursalId;
    if (id) {
      const s = await this.sucursalService.getById(id);
      this.sucursalActual.set(s);
      this.turnoService.procesarClasesVencidas(id).catch(err => console.error('[procesarClasesVencidas]', err));
      this.verificarAlertasFlota(id).catch(err => console.error('[verificarAlertasFlota]', err));
    }
  }

  private async verificarAlertasFlota(sucursalId: string): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid) return;
    const KEY = `flota_check_${sucursalId}`;
    if (localStorage.getItem(KEY) === new Date().toDateString()) return;

    const [autos, mantenimientos] = await Promise.all([
      this.autoService.getAutosOnce(sucursalId),
      this.autoService.getMantenimientosPorSucursalOnce(sucursalId),
    ]);

    const notifs: Promise<void>[] = [];

    for (const auto of autos.filter(a => a.activo)) {
      const mantAuto = mantenimientos.filter(m => m.autoId === auto.id);
      const alertas = this.autoService.calcularAlertas(auto, mantAuto);

      const vencidas = alertas.filter(a => a.estado === 'vencido' || a.estado === 'sin_registro');
      const proximas = alertas.filter(a => a.estado === 'proximo');

      if (vencidas.length) {
        notifs.push(this.notifService.enviar(uid, 'mantenimiento_auto',
          `${auto.patente} — Mantenimiento vencido`,
          `${vencidas.length} ítem(s) requieren atención: ${vencidas.map(a => a.label).join(', ')}`,
        ));
      }
      if (proximas.length) {
        notifs.push(this.notifService.enviar(uid, 'mantenimiento_auto',
          `${auto.patente} — Mantenimiento próximo`,
          `${proximas.length} ítem(s) próximos: ${proximas.map(a => a.label).join(', ')}`,
        ));
      }

      const vtvDias = this.autoService.diasHastaVencimiento(auto.vtvVencimiento);
      if (vtvDias !== null && vtvDias <= 30) {
        notifs.push(this.notifService.enviar(uid, 'mantenimiento_auto',
          `${auto.patente} — VTV ${vtvDias <= 0 ? 'vencida' : 'próxima a vencer'}`,
          vtvDias <= 0
            ? `La VTV está vencida hace ${Math.abs(vtvDias)} día(s). Renovar para circular.`
            : `La VTV vence en ${vtvDias} día(s).`,
        ));
      }

      const seguroDias = this.autoService.diasHastaVencimiento(auto.seguroVencimiento);
      if (seguroDias !== null && seguroDias <= 30) {
        notifs.push(this.notifService.enviar(uid, 'mantenimiento_auto',
          `${auto.patente} — Seguro ${seguroDias <= 0 ? 'vencido' : 'próximo a vencer'}`,
          seguroDias <= 0
            ? `El seguro está vencido hace ${Math.abs(seguroDias)} día(s). Renovar la póliza.`
            : `El seguro vence en ${seguroDias} día(s).`,
        ));
      }
    }

    await Promise.all(notifs);
    localStorage.setItem(KEY, new Date().toDateString());
  }
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
    this.notifService.noLeidasLista$(this.authService.currentUser()?.uid ?? ''),
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
      cancelacion_turno: 'event_busy',
      mantenimiento_auto: 'directions_car',
      ausencia_pendiente: 'event_busy',
    };
    return map[tipo] ?? 'notifications';
  }

  readonly navItems = [
    { label: 'Principal', icon: 'dashboard', route: '/admin/dashboard' },
    { label: 'Alumnos', icon: 'people', route: '/admin/alumnos' },
    { label: 'Instructores', icon: 'badge', route: '/admin/instructores' },
    { label: 'Clases y turnos', icon: 'calendar_month', route: '/admin/turnos' },
    { label: 'Asignar clases', icon: 'event_available', route: '/admin/agenda-alumno' },
    { label: 'Reportes', icon: 'bar_chart', route: '/admin/reportes' },
    { label: 'Flota de autos', icon: 'directions_car', route: '/admin/autos' },
    { label: 'Ausencias', icon: 'event_busy', route: '/admin/ausencias' },
    { label: 'Feriados', icon: 'beach_access', route: '/admin/feriados' },
    { label: 'Configuración', icon: 'settings', route: '/admin/configuracion' },
  ];

  readonly superAdminItems = [
    { label: 'Cambiar sucursal', icon: 'swap_horiz', route: '/admin/setup' },
    { label: 'Sucursales', icon: 'store', route: '/admin/sucursales' },
    { label: 'Administradores', icon: 'admin_panel_settings', route: '/admin/administradores' },
  ];

  toggleSidenav(): void { this.sidenavOpened.update(v => !v); }
  async logout(): Promise<void> { await this.authService.logout(); }
}
