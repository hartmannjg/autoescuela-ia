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
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { Turno, User } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-admin-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatProgressSpinnerModule, EstadoTurnoPipe, DuracionPipe],
  templateUrl: './turnos.component.html',
  styleUrl: './turnos.component.scss',
})
export class AdminTurnosComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
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
}
