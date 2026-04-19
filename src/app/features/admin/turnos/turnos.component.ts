import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { NotificacionService } from '../../../core/services/notificacion.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { Turno, User } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-admin-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule, EstadoTurnoPipe, DuracionPipe, FechaHoraPipe],
  templateUrl: './turnos.component.html',
  styleUrl: './turnos.component.scss',
})
export class AdminTurnosComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private notificacionService = inject(NotificacionService);
  private usuarioService = inject(UsuarioService);
  readonly loadingCancel = signal<string | null>(null);
  readonly loadingRestore = signal<string | null>(null);

  get horaActual(): string {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }

  estaEnCurso(turno: Turno): boolean {
    if (turno.fechaStr !== this.hoyStr) return false;
    const ahora = this.horaActual;
    return ahora >= turno.horaInicio && ahora < turno.horaFin;
  }
  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly hoyStr = dateToStr(new Date());
  readonly mesInicio = signal(this.hoyStr.substring(0, 8) + '01');
  readonly mesFin = signal(this.hoyStr.substring(0, 8) + '31');
  readonly filtroInstructor = signal('');
  readonly busqueda = signal('');
  readonly loading = signal(true);
  private _pending = 3;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loading.set(false); };
  readonly instructores = toSignal(this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)), { initialValue: [] as User[] });
  readonly alumnos = toSignal(this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)), { initialValue: [] as User[] });
  readonly turnos = toSignal(this.turnoService.turnosSucursal$(this.sucursalId, this.mesInicio(), this.mesFin()).pipe(tap(this._markLoaded)), { initialValue: [] as Turno[] });

  readonly instructorMap = computed(() => {
    const m = new Map<string, User>();
    this.instructores().forEach(u => m.set(u.uid, u));
    return m;
  });

  readonly alumnoMap = computed(() => {
    const m = new Map<string, User>();
    this.alumnos().forEach(u => m.set(u.uid, u));
    return m;
  });

  readonly CANCELABLES = new Set(['PENDIENTE_CONFIRMACION', 'CONFIRMADA']);

  readonly turnosFiltrados = computed(() => {
    const f = this.filtroInstructor();
    const q = this.busqueda().toLowerCase().trim();
    return this.turnos().filter(t => {
      if (f && t.instructorUid !== f) return false;
      if (q) {
        const alumno = this.alumnoMap().get(t.alumnoUid);
        const nombre = alumno?.nombre?.toLowerCase() ?? '';
        const email = alumno?.email?.toLowerCase() ?? '';
        if (!nombre.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  });

  async cancelar(turno: Turno): Promise<void> {
    const { value: motivo } = await Swal.fire({
      title: 'Cancelar clase',
      input: 'textarea',
      inputLabel: 'Motivo (opcional)',
      inputPlaceholder: 'Indicá el motivo de la cancelación...',
      showCancelButton: true,
      confirmButtonText: 'Cancelar clase',
      confirmButtonColor: '#c62828',
      cancelButtonText: 'Volver',
    });
    if (motivo === undefined) return;
    this.loadingCancel.set(turno.id!);
    try {
      await this.turnoService.cancelarTurno(turno.id!, motivo || 'Cancelado por el administrador.');
      const alumnoNombre = this.alumnoMap().get(turno.alumnoUid)?.nombre ?? turno.alumnoUid;
      const fechaLegible = new Date(turno.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const devolucion = turno.consumidoDe === 'plan' ? 'Tu clase fue devuelta al plan.' : 'Tu crédito fue reintegrado.';
      await Promise.all([
        this.notificacionService.enviar(turno.alumnoUid, 'rechazo_turno', 'Clase cancelada',
          `Tu clase del ${fechaLegible} a las ${turno.horaInicio} fue cancelada por el administrador. ${devolucion}`, turno.id),
        this.notificacionService.enviar(turno.instructorUid, 'rechazo_turno', 'Clase cancelada',
          `La clase de ${alumnoNombre} del ${fechaLegible} a las ${turno.horaInicio} fue cancelada por el administrador.`, turno.id),
      ]);
      Swal.fire({ icon: 'success', title: 'Clase cancelada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.loadingCancel.set(null);
    }
  }

  async eliminar(turno: Turno): Promise<void> {
    const alumnoNombre = this.alumnoMap().get(turno.alumnoUid)?.nombre ?? turno.alumnoUid;
    const fechaLegible = new Date(turno.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const result = await Swal.fire({
      title: 'Eliminar turno cancelado',
      html: `<p>¿Eliminar el turno cancelado de <strong>${alumnoNombre}</strong> del ${fechaLegible} a las ${turno.horaInicio}?</p><p>El saldo ya fue devuelto al alumno cuando se canceló.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      confirmButtonColor: '#c62828',
      cancelButtonText: 'Volver',
    });
    if (!result.isConfirmed) return;
    this.loadingRestore.set(turno.id!);
    try {
      await this.turnoService.eliminarTurnoCancelado(turno.id!);
      Swal.fire({ icon: 'success', title: 'Turno eliminado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.loadingRestore.set(null);
    }
  }
}
