import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import {
  ReporteService, FilaInstructor, FilaAlumno, FilaOcupacion, FilaPlan, FilaIngreso,
} from '../../../core/services/reporte.service';
import { User } from '../../../shared/models';

type TipoReporte = 'instructor' | 'alumno' | 'ocupacion' | 'planes' | 'ingresos';

interface GrupoIngreso {
  periodoKey: string;
  periodoLabel: string;
  cobros: FilaIngreso[];
  totalPlanes: number;
  totalIndividual: number;
  total: number;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule, MatChipsModule,
  ],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss',
})
export class ReportesComponent {
  private authService    = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private reporteService = inject(ReporteService);

  readonly sucursalId   = this.authService.currentUser()?.sucursalId ?? '';
  readonly isSuperAdmin = this.authService.isSuperAdmin;

  // ── Selector de reporte ───────────────────────────────────────────────────
  readonly reporteActivo = signal<TipoReporte>('instructor');

  private readonly todosLosReportes: { id: TipoReporte; label: string; icon: string; desc: string; soloSuperAdmin?: boolean }[] = [
    { id: 'instructor', label: 'Clases por instructor', icon: 'badge',          desc: 'Actividad por instructor en el período' },
    { id: 'alumno',     label: 'Actividad por alumno',  icon: 'school',         desc: 'Clases por estudiante en el período'    },
    { id: 'ocupacion',  label: 'Ocupación',             icon: 'event_available',desc: '% slots ocupados por instructor'        },
    { id: 'planes',     label: 'Saldo de clases',       icon: 'credit_card',    desc: 'Estado de saldo y contrato por alumno' },
    { id: 'ingresos',   label: 'Ingresos',              icon: 'payments',       desc: 'Ganancias por planes y clases',        soloSuperAdmin: true },
  ];

  readonly tiposReporte = computed(() =>
    this.todosLosReportes.filter(r => !r.soloSuperAdmin || this.isSuperAdmin())
  );

  // ── Navegación de rango de meses ─────────────────────────────────────────
  private static mesKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  private static mesKeyLabel(key: string): string {
    const [y, m] = key.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  readonly mesesDisponibles: { key: string; label: string }[] = (() => {
    const result: { key: string; label: string }[] = [];
    const hoy = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      result.push({ key: ReportesComponent.mesKey(d), label: ReportesComponent.mesKeyLabel(ReportesComponent.mesKey(d)) });
    }
    return result;
  })();

  private readonly mesHoy = ReportesComponent.mesKey(new Date());
  readonly mesDesdeKey = signal(this.mesHoy);
  readonly mesHastaKey = signal(this.mesHoy);
  readonly mesLabel    = computed(() => {
    const desde = ReportesComponent.mesKeyLabel(this.mesDesdeKey());
    if (this.mesDesdeKey() === this.mesHastaKey()) return desde;
    return `${desde} — ${ReportesComponent.mesKeyLabel(this.mesHastaKey())}`;
  });
  readonly mesInicio   = computed(() => this.mesDesdeKey() + '-01');
  readonly mesFin      = computed(() => this.mesHastaKey() + '-31');
  readonly rangoFilename = computed(() =>
    this.mesDesdeKey() === this.mesHastaKey()
      ? this.mesLabel().replace(' ', '_')
      : `${this.mesDesdeKey()}_${this.mesHastaKey()}`
  );

  onMesDesdeChange(key: string): void {
    this.mesDesdeKey.set(key);
    if (key > this.mesHastaKey()) this.mesHastaKey.set(key);
  }
  onMesHastaChange(key: string): void {
    this.mesHastaKey.set(key);
    if (key < this.mesDesdeKey()) this.mesDesdeKey.set(key);
  }

  // ── Listas base (reactivas) ───────────────────────────────────────────────
  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(() => {})),
    { initialValue: [] as User[] }
  );
  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(() => {})),
    { initialValue: [] as User[] }
  );

  // ── Reporte 1: Clases por instructor ─────────────────────────────────────
  readonly filtroInstructor = signal('');
  readonly cargandoInst     = signal(false);
  readonly filasInst        = signal<FilaInstructor[]>([]);
  readonly expandidosInst   = signal<Set<string>>(new Set());

  readonly filasInstVisibles = computed(() => {
    const uid = this.filtroInstructor();
    return uid ? this.filasInst().filter(f => f.instructorUid === uid) : this.filasInst();
  });
  readonly totalCompletadasInst = computed(() => this.filasInstVisibles().reduce((s, f) => s + f.completadas, 0));
  readonly totalAusentesInst    = computed(() => this.filasInstVisibles().reduce((s, f) => s + f.ausentes, 0));
  readonly totalCanceladasInst  = computed(() => this.filasInstVisibles().reduce((s, f) => s + f.canceladas, 0));
  readonly totalMinutosInst     = computed(() => this.filasInstVisibles().reduce((s, f) => s + f.totalMinutos, 0));

  async cargarInstructores(): Promise<void> {
    this.cargandoInst.set(true); this.expandidosInst.set(new Set());
    try { this.filasInst.set(await this.reporteService.reporteInstructoresMes(this.sucursalId, this.mesInicio(), this.mesFin())); }
    catch (e: any) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    finally { this.cargandoInst.set(false); }
  }

  toggleDetalleInst(uid: string): void {
    this.expandidosInst.update(s => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  }

  // ── Reporte 2: Actividad por alumno ──────────────────────────────────────
  readonly filtroAlumno  = signal('');
  readonly cargandoAlumno = signal(false);
  readonly filasAlumno   = signal<FilaAlumno[]>([]);
  readonly expandidosAlumno = signal<Set<string>>(new Set());

  readonly filasAlumnoVisibles = computed(() => {
    const uid = this.filtroAlumno();
    return uid ? this.filasAlumno().filter(f => f.alumnoUid === uid) : this.filasAlumno();
  });
  readonly totalCompletadasAlumno = computed(() => this.filasAlumnoVisibles().reduce((s, f) => s + f.completadas, 0));
  readonly totalAusentesAlumno    = computed(() => this.filasAlumnoVisibles().reduce((s, f) => s + f.ausentes, 0));
  readonly totalCanceladasAlumno  = computed(() => this.filasAlumnoVisibles().reduce((s, f) => s + f.canceladas, 0));
  readonly totalMinutosAlumno     = computed(() => this.filasAlumnoVisibles().reduce((s, f) => s + f.totalMinutos, 0));

  async cargarAlumnos(): Promise<void> {
    this.cargandoAlumno.set(true); this.expandidosAlumno.set(new Set());
    try { this.filasAlumno.set(await this.reporteService.reporteAlumnosMes(this.sucursalId, this.mesInicio(), this.mesFin())); }
    catch (e: any) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    finally { this.cargandoAlumno.set(false); }
  }

  toggleDetalleAlumno(uid: string): void {
    this.expandidosAlumno.update(s => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  }

  // ── Reporte 3: Ocupación ─────────────────────────────────────────────────
  readonly cargandoOcup        = signal(false);
  readonly filasOcup           = signal<FilaOcupacion[]>([]);
  readonly totalSlotsDisp      = computed(() => this.filasOcup().reduce((s, f) => s + f.slotsDisponibles, 0));
  readonly totalSlotsOcupados  = computed(() => this.filasOcup().reduce((s, f) => s + f.slotsOcupados, 0));
  readonly pctOcupacionGlobal  = computed(() => {
    const d = this.totalSlotsDisp();
    return d === 0 ? 0 : Math.round((this.totalSlotsOcupados() / d) * 100);
  });

  async cargarOcupacion(): Promise<void> {
    this.cargandoOcup.set(true);
    try { this.filasOcup.set(await this.reporteService.reporteOcupacion(this.sucursalId, this.mesInicio(), this.mesFin(), this.instructores())); }
    catch (e: any) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    finally { this.cargandoOcup.set(false); }
  }

  // ── Reporte 4: Saldo y planes ─────────────────────────────────────────────
  readonly filtroPlan   = signal<'todos' | 'plan' | 'individual' | 'vencido' | 'sin_plan'>('todos');
  readonly filasPlan    = computed(() => this.reporteService.reporteEstadoPlanes(this.alumnos()));
  readonly filasPlanVisibles = computed(() => {
    const f = this.filtroPlan(); const rows = this.filasPlan();
    if (f === 'todos')      return rows;
    if (f === 'vencido')    return rows.filter(r => r.vencido);
    if (f === 'sin_plan')   return rows.filter(r => r.tipoPlan === 'sin_plan');
    return rows.filter(r => r.tipoPlan === f);
  });
  readonly totalValorPlanes = computed(() => this.filasPlanVisibles().filter(r => r.tipoPlan === 'plan').reduce((s, r) => s + r.valor, 0));

  // ── Reporte 5: Ingresos ───────────────────────────────────────────────────
  readonly agrupacionIngresos  = signal<'dia' | 'semana' | 'mes'>('dia');
  readonly cargandoIngresos    = signal(false);
  readonly cobrosRaw    = signal<FilaIngreso[]>([]);
  readonly expandidosIngreso   = signal<Set<string>>(new Set());

  readonly gruposIngresos = computed(() => this.agruparIngresos(this.cobrosRaw(), this.agrupacionIngresos()));
  readonly kpiTotalIngresos   = computed(() => this.gruposIngresos().reduce((s, g) => s + g.total, 0));
  readonly kpiTotalPlanes     = computed(() => this.gruposIngresos().reduce((s, g) => s + g.totalPlanes, 0));
  readonly kpiTotalIndividual = computed(() => this.gruposIngresos().reduce((s, g) => s + g.totalIndividual, 0));

  async cargarIngresos(): Promise<void> {
    this.cargandoIngresos.set(true); this.expandidosIngreso.set(new Set());
    try { this.cobrosRaw.set(await this.reporteService.reporteIngresos(this.sucursalId, this.mesInicio(), this.mesFin())); }
    catch (e: any) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    finally { this.cargandoIngresos.set(false); }
  }

  toggleDetalleIngreso(key: string): void {
    this.expandidosIngreso.update(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  private agruparIngresos(txs: FilaIngreso[], agrupacion: 'dia' | 'semana' | 'mes'): GrupoIngreso[] {
    const map = new Map<string, GrupoIngreso>();
    for (const tx of txs) {
      const key = this.periodoKey(tx.fechaStr, agrupacion);
      if (!map.has(key)) {
        map.set(key, { periodoKey: key, periodoLabel: this.periodoLabel(tx.fechaStr, agrupacion), cobros: [], totalPlanes: 0, totalIndividual: 0, total: 0 });
      }
      const g = map.get(key)!;
      g.cobros.push(tx);
      if (tx.tipo === 'plan') g.totalPlanes += tx.monto; else g.totalIndividual += tx.monto;
      g.total += tx.monto;
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }

  private periodoKey(fechaStr: string, agrupacion: 'dia' | 'semana' | 'mes'): string {
    if (agrupacion === 'dia') return fechaStr;
    if (agrupacion === 'mes') return fechaStr.slice(0, 7);
    const d = new Date(fechaStr + 'T00:00:00');
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  private periodoLabel(fechaStr: string, agrupacion: 'dia' | 'semana' | 'mes'): string {
    const d = new Date(fechaStr + 'T00:00:00');
    if (agrupacion === 'dia') return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
    if (agrupacion === 'mes') { const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
    const day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) => dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    return `${fmt(mon)} — ${fmt(sun)}`;
  }

  // ── Effect principal: recarga al cambiar reporte o mes ────────────────────
  constructor() {
    effect(() => {
      const tipo = this.reporteActivo();
      this.mesDesdeKey();
      this.mesHastaKey();
      untracked(() => {
        if (tipo === 'instructor') this.cargarInstructores();
        else if (tipo === 'alumno') this.cargarAlumnos();
        else if (tipo === 'ocupacion') this.cargarOcupacion();
        else if (tipo === 'ingresos') this.cargarIngresos();
        // planes es computed, no necesita carga
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getNombreInstructor(uid: string): string {
    return this.instructores().find(i => i.uid === uid)?.nombre ?? uid.slice(0, 8) + '…';
  }
  getNombreAlumno(uid: string): string {
    return this.alumnos().find(a => a.uid === uid)?.nombre ?? uid.slice(0, 8) + '…';
  }
  formatMinutos(min: number): string {
    const h = Math.floor(min / 60); const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  }
  getBarWidth(val: number, max: number): string {
    return max === 0 ? '0%' : `${Math.round((val / max) * 100)}%`;
  }
  formatFecha(d: Date | undefined): string {
    if (!d) return '—';
    return d.toLocaleDateString('es-AR');
  }

  // ── Exportar instructor ───────────────────────────────────────────────────
  exportarInstructoresExcel(): void {
    const filas = this.filasInstVisibles();
    const resumen = [
      ...filas.map(f => ({ Instructor: this.getNombreInstructor(f.instructorUid), Completadas: f.completadas, 'Ausencias alumno': f.ausentes, Canceladas: f.canceladas, 'Min. impartidos': f.totalMinutos, 'Horas impartidas': this.formatMinutos(f.totalMinutos) })),
      { Instructor: 'TOTAL', Completadas: this.totalCompletadasInst(), 'Ausencias alumno': this.totalAusentesInst(), Canceladas: this.totalCanceladasInst(), 'Min. impartidos': this.totalMinutosInst(), 'Horas impartidas': this.formatMinutos(this.totalMinutosInst()) },
    ];
    const detalle: any[] = [];
    for (const f of filas) {
      detalle.push({ Instructor: `── ${this.getNombreInstructor(f.instructorUid)}`, Fecha: '', Horario: '', 'Duración (min)': '', Alumno: '', Estado: '', 'Motivo cancelación': '' });
      for (const c of f.clases) {
        detalle.push({ Instructor: this.getNombreInstructor(f.instructorUid), Fecha: c.fechaStr, Horario: `${c.horaInicio} - ${c.horaFin}`, 'Duración (min)': c.duracionMinutos, Alumno: c.alumnoNombre, Estado: c.estado, 'Motivo cancelación': c.estado === 'CANCELADA' ? (c.motivo ?? '') : '' });
      }
    }
    this.reporteService.exportarExcelMultiHoja(
      [{ nombre: 'Resumen', datos: resumen }, { nombre: 'Detalle', datos: detalle }],
      `instructores_${this.rangoFilename()}`
    );
  }

  exportarInstructoresPDF(): void {
    this.reporteService.exportarPDFInstructores(
      `Clases por instructor — ${this.mesLabel()}`,
      this.filasInstVisibles().map(f => ({ nombre: this.getNombreInstructor(f.instructorUid), completadas: f.completadas, ausentes: f.ausentes, canceladas: f.canceladas, horas: this.formatMinutos(f.totalMinutos), clases: f.clases.map(c => ({ fecha: c.fechaStr, horario: `${c.horaInicio} - ${c.horaFin}`, duracion: `${c.duracionMinutos} min`, alumno: c.alumnoNombre, estado: c.estado, motivo: c.estado === 'CANCELADA' ? (c.motivo ?? '—') : '' })) })),
      { completadas: this.totalCompletadasInst(), ausentes: this.totalAusentesInst(), canceladas: this.totalCanceladasInst(), horas: this.formatMinutos(this.totalMinutosInst()) },
      `instructores_${this.rangoFilename()}`
    );
  }

  // ── Exportar alumno ───────────────────────────────────────────────────────
  exportarAlumnosExcel(): void {
    const filas = this.filasAlumnoVisibles();
    const resumen = [
      ...filas.map(f => ({ Alumno: f.alumnoNombre, Completadas: f.completadas, Ausencias: f.ausentes, Canceladas: f.canceladas, 'Horas': this.formatMinutos(f.totalMinutos) })),
      { Alumno: 'TOTAL', Completadas: this.totalCompletadasAlumno(), Ausencias: this.totalAusentesAlumno(), Canceladas: this.totalCanceladasAlumno(), Horas: this.formatMinutos(this.totalMinutosAlumno()) },
    ];
    const detalle: any[] = [];
    for (const f of filas) {
      detalle.push({ Alumno: `── ${f.alumnoNombre}`, Fecha: '', Horario: '', 'Duración (min)': '', Instructor: '', Estado: '', 'Motivo cancelación': '' });
      for (const c of f.clases) {
        detalle.push({ Alumno: f.alumnoNombre, Fecha: c.fechaStr, Horario: `${c.horaInicio} - ${c.horaFin}`, 'Duración (min)': c.duracionMinutos, Instructor: this.getNombreInstructor(c.instructorUid ?? ''), Estado: c.estado, 'Motivo cancelación': c.estado === 'CANCELADA' ? (c.motivo ?? '') : '' });
      }
    }
    this.reporteService.exportarExcelMultiHoja(
      [{ nombre: 'Resumen', datos: resumen }, { nombre: 'Detalle', datos: detalle }],
      `alumnos_${this.rangoFilename()}`
    );
  }

  // ── Exportar ocupación ────────────────────────────────────────────────────
  exportarOcupacionExcel(): void {
    const datos = this.filasOcup().map(f => ({
      Instructor: this.getNombreInstructor(f.instructorUid),
      'Slots disponibles': f.slotsDisponibles,
      'Slots ocupados': f.slotsOcupados,
      'Ocupación %': f.pctOcupacion,
    }));
    this.reporteService.exportarExcel(datos, `ocupacion_${this.rangoFilename()}`);
  }

  // ── Exportar planes ───────────────────────────────────────────────────────
  exportarPlanesExcel(): void {
    const datos = this.filasPlanVisibles().map(r => ({
      Alumno: r.alumnoNombre,
      Plan: r.planNombre,
      Tipo: r.tipoPlan === 'plan' ? 'Plan de clases' : r.tipoPlan === 'individual' ? 'Clases individuales' : 'Sin saldo',
      'Valor $': r.valor || '—',
      'Clases totales': r.clasesTotales || '—',
      'Clases tomadas': r.clasesTomadas,
      'Clases restantes': r.clasesRestantes,
      'Vence': this.formatFecha(r.fechaFin),
      'Vencido': r.vencido ? 'Sí' : 'No',
    }));
    this.reporteService.exportarExcel(datos, `planes_${new Date().toISOString().slice(0,10)}`);
  }

  // ── Exportar ingresos ─────────────────────────────────────────────────────
  exportarIngresosExcel(): void {
    const txs  = [...this.cobrosRaw()].sort((a, b) => a.fechaStr.localeCompare(b.fechaStr));
    const agr  = this.agrupacionIngresos();
    const cols = agr === 'dia' ? 'Fecha' : 'Período / Fecha';
    const rows: Record<string, any>[] = [];

    const fmtFecha = (s: string) =>
      new Date(s + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const sep  = (label: string, monto: number | string = '') => ({ [cols]: label, Alumno: '', Descripción: '', Tipo: '', 'Planes $': '', 'Individuales $': '', 'Total $': monto });
    const tx2row = (tx: FilaIngreso, label?: string) => ({
      [cols]: label ?? fmtFecha(tx.fechaStr),
      Alumno: tx.alumnoNombre,
      Descripción: tx.descripcion,
      Tipo: tx.tipo === 'plan' ? 'Plan' : 'Individual',
      'Planes $':      tx.tipo === 'plan'       ? tx.monto : '',
      'Individuales $': tx.tipo === 'individual' ? tx.monto : '',
      'Total $': tx.monto,
    });
    const subtotal = (label: string, txList: FilaIngreso[]) => sep(
      label,
      txList.reduce((s, t) => s + t.monto, 0)
    );

    if (agr === 'dia') {
      for (const [fecha, dxs] of this.agruparTxs(txs, t => t.fechaStr)) {
        rows.push(sep(`── ${fmtFecha(fecha)}`));
        dxs.forEach(tx => rows.push(tx2row(tx)));
        rows.push(subtotal(`Total ${fmtFecha(fecha)}`, dxs));
        rows.push(sep(''));
      }
    } else if (agr === 'semana') {
      for (const [, semTxs] of this.agruparTxs(txs, t => this.periodoKey(t.fechaStr, 'semana'))) {
        rows.push(sep(`── ${this.periodoLabel(semTxs[0].fechaStr, 'semana')}`));
        for (const [fecha, dxs] of this.agruparTxs(semTxs, t => t.fechaStr)) {
          rows.push(sep(`  ${fmtFecha(fecha)}`));
          dxs.forEach(tx => rows.push(tx2row(tx, `  ${fmtFecha(tx.fechaStr)}`)));
        }
        rows.push(subtotal('  Subtotal semana', semTxs));
        rows.push(sep(''));
      }
    } else {
      for (const [, mesTxs] of this.agruparTxs(txs, t => this.periodoKey(t.fechaStr, 'mes'))) {
        rows.push(sep(`── ${this.periodoLabel(mesTxs[0].fechaStr, 'mes')}`));
        for (const [, semTxs] of this.agruparTxs(mesTxs, t => this.periodoKey(t.fechaStr, 'semana'))) {
          rows.push(sep(`  ── ${this.periodoLabel(semTxs[0].fechaStr, 'semana')}`));
          for (const [fecha, dxs] of this.agruparTxs(semTxs, t => t.fechaStr)) {
            rows.push(sep(`    ${fmtFecha(fecha)}`));
            dxs.forEach(tx => rows.push(tx2row(tx, `    ${fmtFecha(tx.fechaStr)}`)));
          }
          rows.push(subtotal('  Subtotal semana', semTxs));
        }
        rows.push(subtotal(`Total ${this.periodoLabel(mesTxs[0].fechaStr, 'mes')}`, mesTxs));
        rows.push(sep(''));
      }
    }
    rows.push(sep('TOTAL GENERAL', this.kpiTotalIngresos()));

    this.reporteService.exportarExcel(rows, `ingresos_${this.rangoFilename()}`);
  }

  private agruparTxs(txs: FilaIngreso[], keyFn: (tx: FilaIngreso) => string): [string, FilaIngreso[]][] {
    const map = new Map<string, FilaIngreso[]>();
    for (const tx of txs) {
      const k = keyFn(tx);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(tx);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }
}
