import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Timestamp } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { AutoService } from '../../../core/services/auto.service';
import {
  Auto, RegistroMantenimiento, Transmision, TipoCombustible, TipoMotor,
  TipoMantenimientoAuto, MANTENIMIENTO_CONFIG,
} from '../../../shared/models';

@Component({
  selector: 'app-auto-detalle',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTooltipModule, MatProgressSpinnerModule,
    MatDividerModule, MatTableModule,
    MatDatepickerModule, MatNativeDateModule,
  ],
  templateUrl: './auto-detalle.component.html',
  styleUrl: './auto-detalle.component.scss',
})
export class AutoDetalleComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private autoService = inject(AutoService);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly autoId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly auto = toSignal(this.autoService.getById$(this.autoId), { initialValue: null as Auto | null });
  readonly mantenimientos = toSignal(this.autoService.getMantenimientos$(this.autoId), { initialValue: [] as RegistroMantenimiento[] });

  readonly alertas = computed(() => {
    const a = this.auto();
    if (!a) return [];
    return this.autoService.calcularAlertas(a, this.mantenimientos());
  });

  readonly resumenAlertas = computed(() => this.autoService.contarAlertas(this.alertas()));

  readonly vtvDias = computed(() => this.autoService.diasHastaVencimiento(this.auto()?.vtvVencimiento));
  readonly seguroDias = computed(() => this.autoService.diasHastaVencimiento(this.auto()?.seguroVencimiento));

  // KM inline edit
  readonly editandoKm = signal(false);
  readonly nuevoKm = signal(0);
  readonly guardandoKm = signal(false);

  // Editar datos del auto
  readonly editandoDatos = signal(false);
  readonly guardandoDatos = signal(false);

  // Registro de mantenimiento
  readonly guardandoMant = signal(false);

  readonly columnasMant = ['fecha', 'tipo', 'km', 'descripcion', 'costo', 'acciones'];

  readonly tiposOptions = computed(() => {
    const a = this.auto();
    return (Object.entries(MANTENIMIENTO_CONFIG) as [TipoMantenimientoAuto, any][])
      .filter(([_t, cfg]) => !cfg.soloCorrea || a?.tipoMotor === 'correa')
      .map(([value, cfg]) => ({ value, label: cfg.label, detalle: cfg.detalle }));
  });

  formAuto = this.fb.group({
    patente:              ['', Validators.required],
    marca:                ['', Validators.required],
    modelo:               ['', Validators.required],
    anio:                 [new Date().getFullYear(), [Validators.required, Validators.min(1990)]],
    color:                [''],
    transmision:          ['manual' as Transmision, Validators.required],
    combustible:          ['nafta' as TipoCombustible, Validators.required],
    tipoMotor:            ['cadena' as TipoMotor, Validators.required],
    vtvFecha:             [null as Date | null],
    seguroFecha:          [null as Date | null],
    seguroPoliza:         [''],
    seguroAseguradora:    [''],
  });

  formMant = this.fb.group({
    tipo:        ['' as TipoMantenimientoAuto, Validators.required],
    fecha:       [null as Date | null, Validators.required],
    kmAlMomento: [0, [Validators.required, Validators.min(0)]],
    descripcion: [''],
    costo:       [null as number | null],
  });

  abrirEdicion(): void {
    const a = this.auto();
    if (!a) return;
    this.formAuto.patchValue({
      patente: a.patente, marca: a.marca, modelo: a.modelo,
      anio: a.anio, color: a.color ?? '',
      transmision: a.transmision, combustible: a.combustible, tipoMotor: a.tipoMotor,
      seguroPoliza: a.seguroPoliza ?? '', seguroAseguradora: a.seguroAseguradora ?? '',
      vtvFecha:    a.vtvVencimiento    ? a.vtvVencimiento.toDate()    : null,
      seguroFecha: a.seguroVencimiento ? a.seguroVencimiento.toDate() : null,
    });
    this.editandoDatos.set(true);
    setTimeout(() => document.querySelector('.form-auto-card')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  async guardarDatos(): Promise<void> {
    if (this.formAuto.invalid) return;
    const v = this.formAuto.getRawValue();
    this.guardandoDatos.set(true);
    try {
      await this.autoService.actualizar(this.autoId, {
        patente:           v.patente!.toUpperCase().trim(),
        marca:             v.marca!,
        modelo:            v.modelo!,
        anio:              v.anio!,
        color:             v.color || undefined,
        transmision:       v.transmision as Transmision,
        combustible:       v.combustible as TipoCombustible,
        tipoMotor:         v.tipoMotor as TipoMotor,
        seguroPoliza:      v.seguroPoliza || undefined,
        seguroAseguradora: v.seguroAseguradora || undefined,
        vtvVencimiento:    v.vtvFecha    ? Timestamp.fromDate(v.vtvFecha)    : null,
        seguroVencimiento: v.seguroFecha ? Timestamp.fromDate(v.seguroFecha) : null,
      });
      Swal.fire({ icon: 'success', title: 'Datos actualizados', timer: 1500, showConfirmButton: false });
      this.editandoDatos.set(false);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardandoDatos.set(false);
    }
  }

  abrirKm(): void {
    this.nuevoKm.set(this.auto()?.kmActuales ?? 0);
    this.editandoKm.set(true);
  }

  async guardarKm(): Promise<void> {
    const km = this.nuevoKm();
    const actual = this.auto()?.kmActuales ?? 0;
    if (km < actual) {
      const conf = await Swal.fire({
        icon: 'warning',
        title: 'KM menor al actual',
        text: `El nuevo valor (${km.toLocaleString('es-AR')} km) es menor al actual (${actual.toLocaleString('es-AR')} km). ¿Confirmar de todos modos?`,
        showCancelButton: true, confirmButtonText: 'Sí, guardar', cancelButtonText: 'Cancelar',
      });
      if (!conf.isConfirmed) return;
    }
    this.guardandoKm.set(true);
    try {
      await this.autoService.actualizarKm(this.autoId, km);
      this.editandoKm.set(false);
      Swal.fire({ icon: 'success', title: 'Kilometraje actualizado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardandoKm.set(false);
    }
  }

  onTipoMantChange(): void {
    this.formMant.patchValue({ kmAlMomento: this.auto()?.kmActuales ?? 0 });
  }

  async registrarMantenimiento(): Promise<void> {
    if (this.formMant.invalid) return;
    const v = this.formMant.getRawValue();
    this.guardandoMant.set(true);
    try {
      await this.autoService.registrarMantenimiento({
        autoId:      this.autoId,
        sucursalId:  this.sucursalId,
        tipo:        v.tipo as TipoMantenimientoAuto,
        fecha:       Timestamp.fromDate(v.fecha!),
        kmAlMomento: v.kmAlMomento!,
        descripcion: v.descripcion || undefined,
        costo:       v.costo ?? undefined,
      });
      this.formMant.reset({ kmAlMomento: this.auto()?.kmActuales ?? 0 });
      Swal.fire({ icon: 'success', title: 'Registro guardado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardandoMant.set(false);
    }
  }

  async eliminarMantenimiento(reg: RegistroMantenimiento): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning', title: '¿Eliminar registro?',
      text: `${this.getLabel(reg.tipo)} — ${reg.fecha.toDate().toLocaleDateString('es-AR')}`,
      showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#c62828', cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    await this.autoService.eliminarMantenimiento(reg.id!);
  }

  async eliminarAuto(): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning', title: '¿Eliminar auto?',
      html: `Se eliminarán también todos sus registros de mantenimiento.`,
      showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#c62828', cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    try {
      await this.autoService.eliminar(this.autoId);
      this.router.navigate(['/admin/autos']);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
  }

  getLabel(tipo: TipoMantenimientoAuto): string { return MANTENIMIENTO_CONFIG[tipo]?.label ?? tipo; }
  getIcon(tipo: TipoMantenimientoAuto): string { return MANTENIMIENTO_CONFIG[tipo]?.icon ?? 'build'; }

  combustibleLabel(c?: TipoCombustible): string {
    return { nafta: 'Nafta', diesel: 'Diesel', gnc: 'GNC', electrico: 'Eléctrico', hibrido: 'Híbrido' }[c ?? 'nafta'] ?? c ?? '';
  }

  docEstadoClass(dias: number | null): string {
    if (dias === null) return '';
    if (dias <= 0) return 'doc-vencido';
    if (dias <= 30) return 'doc-proximo';
    return 'doc-ok';
  }

  docLabel(dias: number | null): string {
    if (dias === null) return 'Sin registro';
    if (dias <= 0) return `Vencido hace ${Math.abs(dias)} día(s)`;
    if (dias <= 30) return `Vence en ${dias} día(s)`;
    return `Vence en ${dias} días`;
  }

  formatKm(km?: number): string { return (km ?? 0).toLocaleString('es-AR') + ' km'; }
}
