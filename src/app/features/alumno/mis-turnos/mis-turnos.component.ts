import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { Turno } from '../../../shared/models';
import { dateToStr, getSemanaStr, getSemanaBounds } from '../../../shared/utils/date-utils';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

@Component({
  selector: 'app-mis-turnos',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatTabsModule, MatDividerModule, MatProgressSpinnerModule,
    EstadoTurnoPipe, FechaHoraPipe, DuracionPipe,
  ],
  templateUrl: './mis-turnos.component.html',
  styleUrl: './mis-turnos.component.scss',
})
export class MisTurnosComponent {
  private authService   = inject(AuthService);
  private turnoService  = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
  private configService = inject(ConfiguracionService);
  readonly loading = signal(false);
  readonly loadingData = signal(true);

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.authService.currentUser()?.uid ?? '').pipe(tap(() => this.loadingData.set(false))),
    { initialValue: [] as Turno[] }
  );

  /** Mapa uid → nombre de instructor para los turnos cargados. */
  readonly instructoresMap = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      const uids = [...new Set(this.turnos().map(t => t.instructorUid))];
      const known = this.instructoresMap();
      const faltantes = uids.filter(u => !(u in known));
      if (faltantes.length === 0) return;
      Promise.all(faltantes.map(uid => this.usuarioService.getByIdOnce(uid).then(u => ({ uid, nombre: u?.nombre ?? 'Instructor' }))))
        .then(results => {
          const patch: Record<string, string> = {};
          results.forEach(r => patch[r.uid] = r.nombre);
          this.instructoresMap.update(m => ({ ...m, ...patch }));
        });
    });
  }

  nombreInstructor(uid: string): string {
    return this.instructoresMap()[uid] ?? '…';
  }

  private get ahoraStr(): { fechaStr: string; horaStr: string } {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    const h = String(ahora.getHours()).padStart(2, '0');
    const mi = String(ahora.getMinutes()).padStart(2, '0');
    return { fechaStr: `${y}-${m}-${d}`, horaStr: `${h}:${mi}` };
  }

  /** Un turno activo/próximo: está en estado pendiente o confirmado Y su hora de fin aún no pasó */
  esFuturo(turno: Turno): boolean {
    const { fechaStr, horaStr } = this.ahoraStr;
    return (
      ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(turno.estado) &&
      (turno.fechaStr > fechaStr || (turno.fechaStr === fechaStr && turno.horaFin > horaStr))
    );
  }

  /** Se puede cancelar solo si faltan más de 24 horas para el inicio de la clase */
  puedeCancelar(turno: Turno): boolean {
    if (!this.esFuturo(turno)) return false;
    const [h, m] = turno.horaInicio.split(':').map(Number);
    const [y, mo, d] = turno.fechaStr.split('-').map(Number);
    const inicioClase = new Date(y, mo - 1, d, h, m);
    const horasRestantes = (inicioClase.getTime() - Date.now()) / (1000 * 60 * 60);
    return horasRestantes > 24;
  }

  readonly proximos = computed(() => this.turnos().filter(t => this.esFuturo(t)));

  readonly pasados = computed(() =>
    this.turnos().filter(t =>
      ['COMPLETADA', 'AUSENTE', 'CANCELADA', 'RECHAZADA'].includes(t.estado) ||
      // confirmadas/pendientes cuya hora ya pasó (aún no procesadas por el auto-cierre)
      (['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(t.estado) && !this.esFuturo(t))
    )
  );

  async cancelar(turno: Turno): Promise<void> {
    const uid = this.authService.currentUser()!.uid;
    const sucursalId = this.authService.currentUser()?.sucursalId ?? '';
    const hoyStr = dateToStr(new Date());
    const semanaStr = getSemanaStr(hoyStr);

    const [reagendasUsadas, configGlobal, configSuc] = await Promise.all([
      this.turnoService.contarReagendasAlumnoEnSemana(uid, semanaStr),
      this.configService.getOnce(),
      sucursalId ? this.configService.getSucursalOnce(sucursalId) : Promise.resolve(null),
    ]);

    const maxReagendas: number =
      configSuc?.maxReagendasPorSemana ??
      configGlobal?.limites?.maxReagendasPorSemana ??
      4;

    // Si al cancelar se agota el límite, calcular próximo lunes y advertir
    const quedaraSinReagendas = reagendasUsadas + 1 >= maxReagendas;
    let avisoHtml = `<p>Clase del <strong>${turno.fechaStr}</strong> a las <strong>${turno.horaInicio}</strong></p>`;

    if (quedaraSinReagendas) {
      const { domingo } = getSemanaBounds(semanaStr);
      const [y, m, d] = domingo.split('-').map(Number);
      const proximoLunes = new Date(y, m - 1, d + 1);
      const lunesStr = proximoLunes.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
      avisoHtml += `<div style="margin-top:12px;padding:10px 14px;background:#fff3e0;border-left:4px solid #f57c00;border-radius:6px;text-align:left;font-size:0.9rem;color:#e65100">
        <strong>⚠️ Atención:</strong> Si cancelás esta clase habrás usado todas tus reagendas de esta semana
        (${maxReagendas} de ${maxReagendas}). No podrás volver a agendar hasta el
        <strong>${lunesStr}</strong>.
      </div>`;
    }

    const result = await Swal.fire({
      title: '¿Cancelar clase?',
      html: avisoHtml,
      icon: quedaraSinReagendas ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No, conservar',
      confirmButtonColor: '#c62828',
    });
    if (!result.isConfirmed) return;

    this.loading.set(true);
    try {
      await this.turnoService.cancelarTurno(turno.id!);
      await this.authService.recargarUsuario();
      Swal.fire({ icon: 'success', title: 'Clase cancelada', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }
}
