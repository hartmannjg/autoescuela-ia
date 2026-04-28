import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { User, Turno, PreciosPlan, PlanContratado } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { DuracionPipe, formatDuracion } from '../../../shared/pipes/duracion.pipe';
import { calcularFechaFinPlan } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-alumno-detalle',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTabsModule, MatProgressBarModule, MatDividerModule,
    MatProgressSpinnerModule, MatChipsModule, FechaHoraPipe, EstadoTurnoPipe, DuracionPipe,
  ],
  templateUrl: './alumno-detalle.component.html',
  styleUrl: './alumno-detalle.component.scss',
})
export class AlumnoDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private usuarioService = inject(UsuarioService);
  private turnoService = inject(TurnoService);
  private configService = inject(ConfiguracionService);

  readonly alumno = signal<User | null>(null);
  readonly loading = signal(true);
  readonly uid = signal('');

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as Turno[] }
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.uid.set(id);
    const u = await this.usuarioService.getByIdOnce(id);
    this.alumno.set(u);
    this.loading.set(false);
  }

  private async recargar(): Promise<void> {
    const u = await this.usuarioService.getByIdOnce(this.uid());
    this.alumno.set(u);
  }

  readonly ritmoSugerido = computed(() => {
    const plan = this.alumno()?.alumnoData?.planContratado;
    if (!plan || plan.clasesRestantes <= 0) return null;
    const fechaFin: Date = (plan.fechaFin as any)?.toDate?.() ?? new Date(plan.fechaFin as any);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const msPorSemana = 7 * 24 * 60 * 60 * 1000;
    const semanasRestantes = (fechaFin.getTime() - hoy.getTime()) / msPorSemana;
    if (semanasRestantes <= 0) return { vencido: true, clasesPorSemana: 0, semanasRestantes: 0 };
    const clasesPorSemana = Math.ceil(plan.clasesRestantes / semanasRestantes);
    return { vencido: false, clasesPorSemana, semanasRestantes: Math.ceil(semanasRestantes) };
  });

  getSaldoIndividual(): number {
    return this.alumno()?.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0;
  }

  getSaldoTotal(): number {
    const a = this.alumno();
    return (a?.alumnoData?.planContratado?.clasesRestantes ?? 0)
         + (a?.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
  }

  getProgresoPlan(): number {
    const plan = this.alumno()?.alumnoData?.planContratado;
    if (!plan || plan.clasesTotales === 0) return 0;
    return Math.round((plan.clasesTomadas / plan.clasesTotales) * 100);
  }

  async asignarClases(): Promise<void> {
    const { value: cantStr } = await Swal.fire({
      title: 'Asignar clases individuales (40 min)',
      input: 'number',
      inputLabel: 'Cantidad de clases',
      inputAttributes: { min: '1', max: '100', step: '1' },
      showCancelButton: true,
      confirmButtonText: 'Asignar',
      confirmButtonColor: '#1a237e',
      inputValidator: v => (!v || Number(v) < 1) ? 'Ingresá una cantidad válida' : undefined,
    });
    if (!cantStr) return;
    const cant = Number(cantStr);

    const confirm = await Swal.fire({
      title: '¿Confirmar asignación?',
      html: `Vas a agregar <strong>${cant} clase${cant !== 1 ? 's' : ''} suelta${cant !== 1 ? 's' : ''}</strong> a <strong>${this.alumno()?.nombre}</strong>.<br><span style="font-size:13px;color:#888">Se registrará un cobro por esta operación.</span>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      confirmButtonColor: '#1a237e',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({ title: 'Procesando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const sucursalId = this.alumno()?.sucursalId;
    const [global, override] = await Promise.all([
      this.configService.getOnce(),
      sucursalId ? this.configService.getSucursalOnce(sucursalId) : Promise.resolve(null),
    ]);
    const precios = this.configService.getPreciosEfectivos(global, override);
    const precio = cant * precios.precioClase40min;

    const alumno = this.alumno();
    await this.usuarioService.asignarClasesIndividuales(
      this.uid(), cant, precio,
      alumno?.sucursalId ?? '', alumno?.nombre ?? ''
    );
    await this.recargar();
    Swal.fire({ icon: 'success', title: `${cant} clases de 40 min asignadas`, timer: 1800, showConfirmButton: false });
  }

  async quitarClases(): Promise<void> {
    const ind = this.alumno()?.alumnoData?.creditoIndividual;
    if (!ind || ind.clasesDisponibles === 0) {
      Swal.fire({ icon: 'info', title: 'Sin clases individuales', text: 'El alumno no tiene clases individuales disponibles.' });
      return;
    }

    const { value: cant } = await Swal.fire({
      title: 'Quitar clases individuales (40 min)',
      html: `Disponibles: <strong>${ind.clasesDisponibles}</strong>`,
      input: 'number',
      inputLabel: 'Cantidad a quitar',
      inputAttributes: { min: '1', max: String(ind.clasesDisponibles) },
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      confirmButtonColor: '#c62828',
      inputValidator: v => {
        if (!v || Number(v) < 1) return 'Ingresá una cantidad válida';
        if (Number(v) > ind.clasesDisponibles) return `No puede superar ${ind.clasesDisponibles}`;
        return undefined;
      },
    });
    if (!cant) return;

    Swal.fire({ title: 'Procesando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const alumno = this.alumno();
    await this.usuarioService.quitarClasesIndividuales(this.uid(), Number(cant));
    const revertido = await this.usuarioService.revertirCobroDelDia(this.uid(), 'individual', alumno?.sucursalId ?? '');
    await this.recargar();
    Swal.fire({ icon: 'success', title: `${cant} clases quitadas`, text: revertido ? 'El cobro del día fue revertido.' : '', timer: 2000, showConfirmButton: false });
  }

  private async cargarPlanesDisponibles(): Promise<PreciosPlan[]> {
    const sucursalId = this.alumno()?.sucursalId;
    const [global, override] = await Promise.all([
      this.configService.getOnce(),
      sucursalId ? this.configService.getSucursalOnce(sucursalId) : Promise.resolve(null),
    ]);
    const precios = this.configService.getPreciosEfectivos(global, override);
    return precios.planes.filter(p => p.activo);
  }

  async asignarPlan(): Promise<void> {
    const planes = await this.cargarPlanesDisponibles();
    if (!planes.length) {
      Swal.fire({ icon: 'info', title: 'Sin planes disponibles', text: 'No hay planes activos configurados.', confirmButtonColor: '#1a237e' });
      return;
    }

    const cardsHtml = planes.map(p => `
      <label class="swal-plan-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e0e0e0;border-radius:10px;cursor:pointer;transition:border-color .15s,background .15s;margin-bottom:8px;text-align:left;">
        <input type="radio" name="swal-plan" value="${p.id}" style="accent-color:#1a237e;width:16px;height:16px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:15px;color:#1a1a1a">${p.nombre}</div>
          <div style="font-size:13px;color:#555;margin-top:2px">${p.cantidadClases} clases · ${formatDuracion(p.duracionClase)} por clase</div>
          ${p.precio ? `<div style="font-size:13px;color:#1a237e;font-weight:500;margin-top:2px">$${p.precio.toLocaleString('es-AR')}</div>` : ''}
        </div>
      </label>
    `).join('');

    const { value: planId } = await Swal.fire({
      title: 'Asignar plan',
      html: `<div id="swal-planes-container" style="max-height:340px;overflow-y:auto;padding:4px 2px">${cardsHtml}</div>`,
      showCancelButton: true,
      confirmButtonText: 'Asignar',
      confirmButtonColor: '#1a237e',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        // Highlight on selection
        document.querySelectorAll<HTMLInputElement>('input[name="swal-plan"]').forEach(radio => {
          radio.addEventListener('change', () => {
            document.querySelectorAll<HTMLElement>('.swal-plan-card').forEach(card => {
              (card as HTMLElement).style.borderColor = '#e0e0e0';
              (card as HTMLElement).style.background  = '';
            });
            const label = radio.closest<HTMLElement>('.swal-plan-card');
            if (label) { label.style.borderColor = '#1a237e'; label.style.background = '#e8eaf6'; }
          });
          radio.closest<HTMLElement>('.swal-plan-card')?.addEventListener('click', () => radio.click());
        });
      },
      preConfirm: () => {
        const checked = document.querySelector<HTMLInputElement>('input[name="swal-plan"]:checked');
        if (!checked) { Swal.showValidationMessage('Seleccioná un plan'); return false; }
        return checked.value;
      },
    });

    if (!planId) return;
    const plan = planes.find(p => p.id === planId)!;

    const confirm = await Swal.fire({
      title: '¿Confirmar asignación?',
      html: `Vas a asignar el plan <strong>${plan.nombre}</strong> (${plan.cantidadClases} clases) a <strong>${this.alumno()?.nombre}</strong>.${plan.precio ? `<br><span style="font-size:13px;color:#1a237e;font-weight:600">Cobro: $${plan.precio.toLocaleString('es-AR')}</span>` : ''}<br><span style="font-size:13px;color:#888">Se registrará un cobro por esta operación.</span>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      confirmButtonColor: '#1a237e',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({ title: 'Procesando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const hoy = new Date();
    const minSem = plan.minClasesPorSemana ?? 1;
    const fin = calcularFechaFinPlan(plan.cantidadClases, minSem);

    const planContratado: PlanContratado = {
      id: plan.id,
      nombre: plan.nombre,
      duracionClase: plan.duracionClase,
      clasesTotales: plan.cantidadClases,
      clasesRestantes: plan.cantidadClases,
      clasesTomadas: 0,
      fechaInicio: hoy as any,
      fechaFin: fin as any,
      valor: plan.precio,
      maxClasesPorDia: plan.maxClasesPorDia,
      maxClasesPorSemana: plan.maxClasesPorSemana,
      minClasesPorSemana: minSem,
      semanasInactivas: 0,
    };

    const alumno = this.alumno();
    await this.usuarioService.asignarPlan(
      this.uid(), planContratado,
      alumno?.sucursalId ?? '', alumno?.nombre ?? ''
    );
    await this.recargar();
    Swal.fire({ icon: 'success', title: 'Plan asignado', text: `${plan.nombre} asignado correctamente.`, timer: 1800, showConfirmButton: false });
  }

  async quitarPlan(): Promise<void> {
    const plan = this.alumno()?.alumnoData?.planContratado;
    if (!plan) return;
    const r = await Swal.fire({
      title: 'Quitar plan',
      text: `¿Querés quitar el plan "${plan.nombre}"? Se perderán las clases restantes.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      confirmButtonColor: '#c62828',
    });
    if (r.isConfirmed) {
      Swal.fire({ title: 'Procesando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const alumno = this.alumno();
      await this.usuarioService.quitarPlan(this.uid());
      const revertido = await this.usuarioService.revertirCobroDelDia(this.uid(), 'plan', alumno?.sucursalId ?? '');
      await this.recargar();
      Swal.fire({ icon: 'success', title: 'Plan quitado', text: revertido ? 'El cobro del día fue revertido.' : '', timer: 2000, showConfirmButton: false });
    }
  }

  async extenderPlan(): Promise<void> {
    const plan = this.alumno()?.alumnoData?.planContratado;
    if (!plan) return;
    const fechaFinActual: Date = (plan.fechaFin as any)?.toDate?.() ?? new Date(plan.fechaFin as any);
    const fmt = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const opciones = [
      { value: '1m',  label: '+1 mes' },
      { value: '2m',  label: '+2 meses' },
      { value: '3m',  label: '+3 meses' },
      { value: 'custom', label: 'Fecha personalizada' },
    ];
    const radiosHtml = opciones.map(o =>
      `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;cursor:pointer;margin-bottom:6px">
        <input type="radio" name="ext" value="${o.value}" style="accent-color:#1a237e">
        <span style="font-size:14px">${o.label}</span>
      </label>`
    ).join('');

    const { value: opcion } = await Swal.fire({
      title: 'Extender plan',
      html: `<p style="margin:0 0 12px;font-size:13px;color:#666">Vencimiento actual: <strong>${fmt(fechaFinActual)}</strong></p>
             <div style="text-align:left">${radiosHtml}</div>
             <input type="date" id="swal-fecha-custom" style="display:none;margin-top:10px;width:100%;padding:8px 10px;border:1.5px solid #c5cae9;border-radius:8px;font-size:14px">`,
      showCancelButton: true,
      confirmButtonText: 'Extender',
      confirmButtonColor: '#1a237e',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        document.querySelectorAll<HTMLInputElement>('input[name="ext"]').forEach(r => {
          r.addEventListener('change', () => {
            const custom = document.getElementById('swal-fecha-custom') as HTMLInputElement;
            custom.style.display = r.value === 'custom' ? 'block' : 'none';
          });
        });
      },
      preConfirm: () => {
        const checked = document.querySelector<HTMLInputElement>('input[name="ext"]:checked');
        if (!checked) { Swal.showValidationMessage('Seleccioná una opción'); return false; }
        if (checked.value === 'custom') {
          const input = document.getElementById('swal-fecha-custom') as HTMLInputElement;
          if (!input.value) { Swal.showValidationMessage('Ingresá una fecha'); return false; }
          return input.value;
        }
        return checked.value;
      },
    });

    if (!opcion) return;

    let nuevaFecha: Date;
    const base = fechaFinActual > new Date() ? new Date(fechaFinActual) : new Date();
    if (opcion === '1m') { nuevaFecha = new Date(base); nuevaFecha.setMonth(nuevaFecha.getMonth() + 1); }
    else if (opcion === '2m') { nuevaFecha = new Date(base); nuevaFecha.setMonth(nuevaFecha.getMonth() + 2); }
    else if (opcion === '3m') { nuevaFecha = new Date(base); nuevaFecha.setMonth(nuevaFecha.getMonth() + 3); }
    else { const [y, m, d] = opcion.split('-').map(Number); nuevaFecha = new Date(y, m - 1, d); }

    await this.usuarioService.extenderPlan(this.uid(), nuevaFecha);
    await this.recargar();
    Swal.fire({ icon: 'success', title: 'Plan extendido', text: `Nuevo vencimiento: ${fmt(nuevaFecha)}`, timer: 2000, showConfirmButton: false });
  }

  async toggleBloqueo(): Promise<void> {
    const a = this.alumno();
    if (!a) return;
    if (a.alumnoData?.bloqueado) {
      const r = await Swal.fire({ title: '¿Desbloquear alumno?', text: a.nombre, icon: 'question', showCancelButton: true, confirmButtonText: 'Desbloquear', confirmButtonColor: '#2e7d32' });
      if (r.isConfirmed) {
        await this.usuarioService.desbloquearAlumno(a.uid);
        await this.recargar();
      }
    } else {
      const { value: motivo } = await Swal.fire({ title: 'Bloquear alumno', input: 'textarea', inputLabel: 'Motivo', showCancelButton: true, confirmButtonText: 'Bloquear', confirmButtonColor: '#c62828', inputValidator: v => !v ? 'Requerido' : undefined });
      if (motivo) {
        await this.usuarioService.bloquearAlumno(a.uid, motivo);
        await this.recargar();
      }
    }
  }
}
