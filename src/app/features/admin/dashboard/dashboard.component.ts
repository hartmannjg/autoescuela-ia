import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { tap, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { Turno, User, InstructorAusencia } from '../../../shared/models';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule, MatProgressSpinnerModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class AdminDashboardComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private turnoService = inject(TurnoService);
  private ausenciaService = inject(AusenciaService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly hoyStr = dateToStr(new Date());
  readonly loading = signal(true);
  private _pending = 4;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loading.set(false); };

  readonly alumnos = toSignal(this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)), { initialValue: [] as User[] });
  readonly instructores = toSignal(this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)), { initialValue: [] as User[] });
  readonly turnosHoy = toSignal(this.turnoService.turnosSucursal$(this.sucursalId, this.hoyStr, this.hoyStr).pipe(tap(this._markLoaded)), { initialValue: [] as Turno[] });
  readonly ausenciasPendientesLista = toSignal(
    this.ausenciaService.ausenciasPorSucursal$(this.sucursalId).pipe(
      tap(this._markLoaded),
      map(a => a.filter(x => x.estado === 'pendiente'))
    ),
    { initialValue: [] as InstructorAusencia[] }
  );

  readonly alumnosActivos = computed(() => this.alumnos().filter(a => a.activo).length);
  readonly alumnosBloqueados = computed(() => this.alumnos().filter(a => a.alumnoData?.bloqueado).length);
  readonly clasesHoy = computed(() => this.turnosHoy().length);
  readonly clasesConfirmadasHoy = computed(() => this.turnosHoy().filter(t => t.estado === 'CONFIRMADA').length);
  readonly pendientesConfirmacion = computed(() => this.turnosHoy().filter(t => t.estado === 'PENDIENTE_CONFIRMACION').length);
  readonly ausenciasPendientes = computed(() => this.ausenciasPendientesLista().length);
}
