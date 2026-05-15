import { Component, inject, signal, computed, effect, untracked, ViewChild } from '@angular/core';
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
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTabsModule } from '@angular/material/tabs';
import { FormsModule } from '@angular/forms';
import { tap, switchMap } from 'rxjs';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { NotificacionService } from '../../../core/services/notificacion.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { SucursalService } from '../../../core/services/sucursal.service';
import { Turno, User, Sucursal } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';
import { DisponibilidadGridComponent } from '../../../shared/components/disponibilidad-grid/disponibilidad-grid.component';

@Component({
  selector: 'app-admin-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule,
    MatPaginatorModule, MatTabsModule, EstadoTurnoPipe, DuracionPipe, FechaHoraPipe,
    DisponibilidadGridComponent],
  templateUrl: './turnos.component.html',
  styleUrl: './turnos.component.scss',
})
export class AdminTurnosComponent {
  private authService    = inject(AuthService);
  private turnoService   = inject(TurnoService);
  private notifService   = inject(NotificacionService);
  private usuarioService = inject(UsuarioService);
  private sucursalService = inject(SucursalService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);

  @ViewChild(DisponibilidadGridComponent) private dispGrid?: DisponibilidadGridComponent;

  readonly sucursal = signal<Sucursal | null>(null);

  readonly loadingCancel = signal<string | null>(null);
  readonly pagina   = signal(0);
  readonly pageSize = 25;

  // ── Filtros ───────────────────────────────────────────────────────────────
  readonly sucursalId      = this.authService.currentUser()?.sucursalId ?? '';
  readonly hoyStr          = dateToStr(new Date());
  readonly filtroInstructor = signal('');
  readonly busqueda        = signal('');
  readonly filtroAlumnoId  = signal('');

  // ── Navegación de mes ─────────────────────────────────────────────────────
  readonly mesOffset      = signal(0);
  readonly diaSeleccionado = signal<string | null>(null);
  readonly diasSemana     = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly mesActual = computed(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth() + this.mesOffset(), 1);
  });

  readonly mesLabel = computed(() =>
    this.mesActual().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  );

  readonly mesInicioCal = computed(() => {
    const m = this.mesActual();
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
  });

  readonly mesFinCal = computed(() => {
    const m = this.mesActual();
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-31`;
  });

  readonly diasMes = computed(() => {
    const mes  = this.mesActual();
    const año  = mes.getFullYear();
    const mes0 = mes.getMonth();
    const totalDias = new Date(año, mes0 + 1, 0).getDate();
    const primerDia = new Date(año, mes0, 1).getDay();
    const offset    = primerDia === 0 ? 6 : primerDia - 1;

    const dias: Array<{ fechaStr: string; dia: number; esHoy: boolean } | null> = [];
    for (let i = 0; i < offset; i++) dias.push(null);
    for (let d = 1; d <= totalDias; d++) {
      const fechaStr = `${año}-${String(mes0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dias.push({ fechaStr, dia: d, esHoy: fechaStr === this.hoyStr });
    }
    return dias;
  });

  // ── Carga de datos ────────────────────────────────────────────────────────
  readonly loadingBase   = signal(true);
  readonly loadingTurnos = signal(true);
  readonly loading       = computed(() => this.loadingBase() || this.loadingTurnos());

  private _basePending = 2;
  private readonly _markBase = () => { if (--this._basePending === 0) this.loadingBase.set(false); };

  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(this._markBase)),
    { initialValue: [] as User[] }
  );
  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(this._markBase)),
    { initialValue: [] as User[] }
  );
  readonly turnos = toSignal(
    toObservable(this.mesInicioCal).pipe(
      tap(() => this.loadingTurnos.set(true)),
      switchMap(inicio =>
        this.turnoService.turnosSucursal$(this.sucursalId, inicio, this.mesFinCal())
          .pipe(tap(() => this.loadingTurnos.set(false)))
      )
    ),
    { initialValue: [] as Turno[] }
  );

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
    const f   = this.filtroInstructor();
    const q   = this.busqueda().toLowerCase().trim();
    const uid = this.filtroAlumnoId();
    return this.turnos()
      .filter(t => {
        if (f && t.instructorUid !== f) return false;
        if (uid && t.alumnoUid !== uid) return false;
        if (q) {
          const alumno = this.alumnoMap().get(t.alumnoUid);
          const nombre = alumno?.nombre?.toLowerCase() ?? '';
          const email  = alumno?.email?.toLowerCase() ?? '';
          if (!nombre.includes(q) && !email.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.fechaStr.localeCompare(a.fechaStr) || a.horaInicio.localeCompare(b.horaInicio));
  });

  readonly turnosPaginados = computed(() =>
    this.turnosFiltrados().slice(this.pagina() * this.pageSize, (this.pagina() + 1) * this.pageSize)
  );

  // ── Calendario ────────────────────────────────────────────────────────────
  readonly turnosPorFecha = computed(() => {
    const map = new Map<string, Turno[]>();
    this.turnosFiltrados().forEach(t => {
      const lista = map.get(t.fechaStr) ?? [];
      lista.push(t);
      map.set(t.fechaStr, lista);
    });
    return map;
  });

  readonly turnosDiaSeleccionado = computed(() => {
    const dia = this.diaSeleccionado();
    if (!dia) return [];
    return (this.turnosPorFecha().get(dia) ?? []).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  });

  readonly instructoresDisponibilidad = computed(() => {
    const f = this.filtroInstructor();
    return f ? this.instructores().filter(i => i.uid === f) : this.instructores();
  });

  constructor() {
    const alumnoId = this.route.snapshot.queryParamMap.get('alumnoId');
    if (alumnoId) this.filtroAlumnoId.set(alumnoId);
    this.sucursalService.getById(this.sucursalId).then(s => this.sucursal.set(s));

    effect(() => {
      this.filtroInstructor();
      this.busqueda();
      this.filtroAlumnoId();
      this.mesOffset();
      untracked(() => { this.pagina.set(0); this.diaSeleccionado.set(null); });
    });
  }

  limpiarFiltros(): void {
    this.filtroInstructor.set('');
    this.busqueda.set('');
    this.filtroAlumnoId.set('');
    this.mesOffset.set(0);
  }

  get nombreAlumnoFiltro(): string {
    const id = this.filtroAlumnoId();
    return id ? (this.alumnoMap().get(id)?.nombre ?? id) : '';
  }

  seleccionarDia(fechaStr: string): void {
    this.diaSeleccionado.update(v => v === fechaStr ? null : fechaStr);
  }

  tieneConfirmadas(fechaStr: string): boolean {
    return (this.turnosPorFecha().get(fechaStr) ?? []).some(t => t.estado === 'CONFIRMADA');
  }

  tienePendientes(fechaStr: string): boolean {
    return (this.turnosPorFecha().get(fechaStr) ?? []).some(t => t.estado === 'PENDIENTE_CONFIRMACION');
  }

  tieneCanceladas(fechaStr: string): boolean {
    return (this.turnosPorFecha().get(fechaStr) ?? []).some(t => t.estado === 'CANCELADA');
  }

  contarTurnos(fechaStr: string): number {
    return (this.turnosPorFecha().get(fechaStr) ?? []).length;
  }

  get horaActual(): string {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }

  estaEnCurso(turno: Turno): boolean {
    if (turno.fechaStr !== this.hoyStr) return false;
    const ahora = this.horaActual;
    return ahora >= turno.horaInicio && ahora < turno.horaFin;
  }

  abrirSelectorAlumno(instructor: User): void {
    const alumnos = this.alumnos()
      .filter(a => !a.alumnoData?.bloqueado)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (alumnos.length === 0) {
      Swal.fire({ icon: 'info', title: 'Sin alumnos activos', text: 'No hay alumnos activos en esta sucursal.' });
      return;
    }

    const render = (q: string, list: HTMLElement) => {
      const f = q.toLowerCase();
      const filtrados = f ? alumnos.filter(a => a.nombre.toLowerCase().includes(f) || a.email.toLowerCase().includes(f)) : alumnos;
      list.innerHTML = filtrados.map(a => `
        <button data-uid="${a.uid}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa;cursor:pointer;text-align:left;width:100%;box-sizing:border-box;font-family:inherit;">
          <div style="width:32px;height:32px;border-radius:50%;background:#37474f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${a.nombre.charAt(0)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.9rem;">${a.nombre}</div>
            <div style="font-size:0.75rem;color:#888;">${a.email}</div>
          </div>
        </button>
      `).join('');

      list.querySelectorAll<HTMLButtonElement>('button[data-uid]').forEach(btn => {
        btn.addEventListener('click', () => {
          Swal.close();
          this.router.navigate(['/admin/agenda-alumno'], {
            queryParams: { alumnoId: btn.dataset['uid'], instructorId: instructor.uid },
          });
        });
      });
    };

    Swal.fire({
      title: `Agendar con ${instructor.nombre}`,
      html: `
        <input id="swal-search" class="swal2-input" placeholder="Buscar alumno..." style="margin-bottom:10px;" />
        <div id="swal-list" style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:2px;"></div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const search = document.getElementById('swal-search') as HTMLInputElement;
        const list   = document.getElementById('swal-list') as HTMLElement;
        render('', list);
        search.addEventListener('input', () => render(search.value, list));
        search.focus();
      },
    });
  }

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
        this.notifService.enviar(turno.alumnoUid, 'rechazo_turno', 'Clase cancelada',
          `Tu clase del ${fechaLegible} a las ${turno.horaInicio} fue cancelada por el administrador. ${devolucion}`, turno.id),
        this.notifService.enviar(turno.instructorUid, 'rechazo_turno', 'Clase cancelada',
          `La clase de ${alumnoNombre} del ${fechaLegible} a las ${turno.horaInicio} fue cancelada por el administrador.`, turno.id),
      ]);
      this.dispGrid?.cargar();
      Swal.fire({ icon: 'success', title: 'Clase cancelada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.loadingCancel.set(null);
    }
  }

}
