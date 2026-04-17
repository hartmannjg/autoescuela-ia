import { Component, inject, signal, computed } from '@angular/core';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { User } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-excepciones',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatTooltipModule, MatTabsModule, MatProgressSpinnerModule, FechaHoraPipe,
  ],
  templateUrl: './excepciones.component.html',
  styleUrl: './excepciones.component.scss',
})
export class ExcepcionesComponent {
  private authService    = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private configService  = inject(ConfiguracionService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly loading = signal(true);

  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as User[] }
  );

  readonly bloqueados = computed(() =>
    this.alumnos().filter(a => a.alumnoData?.bloqueado === true)
  );

  readonly sinSaldo = computed(() =>
    this.alumnos().filter(a => {
      const saldo = (a.alumnoData?.planContratado?.clasesRestantes ?? 0) +
                    (a.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
      return saldo === 0 && !a.alumnoData?.bloqueado;
    })
  );

  readonly enRiesgo = computed(() =>
    this.alumnos().filter(a => {
      const saldo = (a.alumnoData?.planContratado?.clasesRestantes ?? 0) +
                    (a.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
      return saldo > 0 && saldo <= 2 && !a.alumnoData?.bloqueado;
    })
  );

  readonly columnasBloqueados = ['nombre', 'motivo', 'desde', 'acciones'];
  readonly columnasSaldo = ['nombre', 'email', 'tipo', 'acciones'];

  async desbloquear(alumno: User): Promise<void> {
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Desbloquear alumno?',
      text: alumno.nombre,
      showCancelButton: true,
      confirmButtonText: 'Desbloquear',
      confirmButtonColor: '#2e7d32',
    });
    if (conf.isConfirmed) {
      await this.usuarioService.desbloquearAlumno(alumno.uid);
      Swal.fire({ icon: 'success', title: 'Alumno desbloqueado', timer: 1500, showConfirmButton: false });
    }
  }

  async asignarClases(alumno: User): Promise<void> {
    const { value: cant } = await Swal.fire({
      title: 'Asignar clases individuales (40 min)',
      input: 'number',
      inputLabel: 'Clases a agregar',
      inputAttributes: { min: '1', max: '50' },
      showCancelButton: true,
      confirmButtonText: 'Asignar',
      confirmButtonColor: '#1a237e',
      inputValidator: v => (!v || Number(v) < 1) ? 'Ingresá una cantidad válida' : undefined,
    });
    if (!cant) return;

    await this.usuarioService.asignarClasesIndividuales(alumno.uid, Number(cant));
    Swal.fire({ icon: 'success', title: `${cant} clases de 40 min asignadas`, timer: 1800, showConfirmButton: false });
  }

  getTipoAlumno(a: User): string {
    return a.alumnoData?.tipoAlumno === 'plan' ? 'Plan' :
           a.alumnoData?.tipoAlumno === 'individual' ? 'Individual' : 'Mixto';
  }
}
