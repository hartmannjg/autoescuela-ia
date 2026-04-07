import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { Turno, User } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-admin-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatFormFieldModule, MatSelectModule, FechaHoraPipe, EstadoTurnoPipe],
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
  readonly instructores = toSignal(this.usuarioService.instructoresPorSucursal$(this.sucursalId), { initialValue: [] as User[] });
  readonly turnos = toSignal(this.turnoService.turnosSucursal$(this.sucursalId, this.mesInicio(), this.mesFin()), { initialValue: [] as Turno[] });
  readonly turnosFiltrados = computed(() => {
    const f = this.filtroInstructor();
    return f ? this.turnos().filter(t => t.instructorUid === f) : this.turnos();
  });
}
