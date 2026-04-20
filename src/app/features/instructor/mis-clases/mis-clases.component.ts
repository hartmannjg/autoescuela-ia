import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { tap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule } from '@angular/material/paginator';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-mis-clases',
  standalone: true,
  imports: [CommonModule, NgTemplateOutlet, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatTabsModule, MatProgressSpinnerModule, MatTooltipModule, MatPaginatorModule, EstadoTurnoPipe, FechaHoraPipe, DuracionPipe],
  templateUrl: './mis-clases.component.html',
  styleUrl: './mis-clases.component.scss',
})
export class MisClasesComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
  private route = inject(ActivatedRoute);

  readonly hoyStr = dateToStr(new Date());
  readonly loading = signal(true);
  readonly tabSeleccionado = signal(0);
  readonly paginaHistorial = signal(0);
  readonly pageSize = 20;
  readonly alumnoNombres = signal<Map<string, string>>(new Map());
  readonly mesOffset = signal(0);
  readonly diaSeleccionado = signal<string | null>(null);

  readonly diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly turnos = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '').pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as Turno[] }
  );

  constructor() {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab !== null) this.tabSeleccionado.set(Number(tab));

    effect(() => {
      const uids = [...new Set(this.turnos().map(t => t.alumnoUid))];
      uids.forEach(uid => {
        if (!this.alumnoNombres().has(uid)) {
          this.usuarioService.getByIdOnce(uid).then(u => {
            if (u) this.alumnoNombres.update(m => new Map(m).set(uid, u.nombre));
          });
        }
      });
    });
  }

  getNombreAlumno(uid: string): string {
    return this.alumnoNombres().get(uid) ?? '…';
  }

  readonly proximas = computed(() =>
    this.turnos().filter(t => t.fechaStr >= this.hoyStr && ['CONFIRMADA', 'PENDIENTE_CONFIRMACION'].includes(t.estado))
  );

  readonly historial = computed(() =>
    this.turnos().filter(t => t.fechaStr < this.hoyStr || ['COMPLETADA', 'CANCELADA', 'AUSENTE'].includes(t.estado))
  );

  readonly historialPaginado = computed(() =>
    this.historial().slice(this.paginaHistorial() * this.pageSize, (this.paginaHistorial() + 1) * this.pageSize)
  );

  readonly agrupadoPorFecha = computed(() => {
    const map = new Map<string, Turno[]>();
    this.proximas().forEach(t => {
      const grupo = map.get(t.fechaStr) ?? [];
      grupo.push(t);
      map.set(t.fechaStr, grupo);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  readonly turnosPorFecha = computed(() => {
    const map = new Map<string, Turno[]>();
    this.turnos()
      .filter(t => ['CONFIRMADA', 'PENDIENTE_CONFIRMACION'].includes(t.estado))
      .forEach(t => {
        const lista = map.get(t.fechaStr) ?? [];
        lista.push(t);
        map.set(t.fechaStr, lista);
      });
    return map;
  });

  readonly mesActual = computed(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth() + this.mesOffset(), 1);
  });

  readonly mesLabel = computed(() =>
    this.mesActual().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  );

  readonly diasMes = computed(() => {
    const mes = this.mesActual();
    const año = mes.getFullYear();
    const mes0 = mes.getMonth();
    const totalDias = new Date(año, mes0 + 1, 0).getDate();

    // Primer día del mes (0=Dom → ajustamos a Lun=0)
    const primerDia = new Date(año, mes0, 1).getDay();
    const offset = primerDia === 0 ? 6 : primerDia - 1;

    const dias: Array<{ fechaStr: string; dia: number; esHoy: boolean; offset?: number } | null> = [];
    for (let i = 0; i < offset; i++) dias.push(null);
    for (let d = 1; d <= totalDias; d++) {
      const fechaStr = `${año}-${String(mes0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dias.push({ fechaStr, dia: d, esHoy: fechaStr === this.hoyStr });
    }
    return dias;
  });

  readonly turnosDiaSeleccionado = computed(() => {
    const dia = this.diaSeleccionado();
    if (!dia) return [];
    return (this.turnosPorFecha().get(dia) ?? []).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  });

  seleccionarDia(fechaStr: string): void {
    this.diaSeleccionado.update(v => v === fechaStr ? null : fechaStr);
  }

  tieneConfirmadas(fechaStr: string): boolean {
    return (this.turnosPorFecha().get(fechaStr) ?? []).some(t => t.estado === 'CONFIRMADA');
  }

  tienePendientes(fechaStr: string): boolean {
    return (this.turnosPorFecha().get(fechaStr) ?? []).some(t => t.estado === 'PENDIENTE_CONFIRMACION');
  }
}
