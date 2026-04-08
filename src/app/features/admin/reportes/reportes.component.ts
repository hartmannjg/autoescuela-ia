import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { ReporteService, ReporteClases } from '../../../core/services/reporte.service';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, MatDividerModule,
  ],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss',
})
export class ReportesComponent {
  private authService = inject(AuthService);
  private reporteService = inject(ReporteService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';

  // Default: current month
  private hoy = new Date();
  readonly desde = signal(`${this.hoy.getFullYear()}-${String(this.hoy.getMonth() + 1).padStart(2, '0')}-01`);
  readonly hasta = signal(dateToStr(this.hoy));

  readonly cargando = signal(false);
  readonly reporte = signal<ReporteClases | null>(null);

  get tasaCompletadas(): number {
    const r = this.reporte();
    if (!r || r.totalClases === 0) return 0;
    return Math.round((r.clasesCompletadas / r.totalClases) * 100);
  }

  get tasaAusencia(): number {
    const r = this.reporte();
    if (!r || r.totalClases === 0) return 0;
    return Math.round((r.clasesAusentes / r.totalClases) * 100);
  }

  async generarReporte(): Promise<void> {
    if (!this.desde() || !this.hasta()) return;
    this.cargando.set(true);
    try {
      const data = await this.reporteService.reporteClasesPorPeriodo(
        this.sucursalId, this.desde(), this.hasta()
      );
      this.reporte.set(data);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error al generar reporte', text: e.message });
    } finally {
      this.cargando.set(false);
    }
  }

  exportarExcel(): void {
    const r = this.reporte();
    if (!r) return;
    const datos = [
      { Métrica: 'Total clases', Valor: r.totalClases },
      { Métrica: 'Completadas', Valor: r.clasesCompletadas },
      { Métrica: 'Ausentes', Valor: r.clasesAusentes },
      { Métrica: 'Canceladas', Valor: r.clasesCanceladas },
      { Métrica: 'Tasa completadas %', Valor: this.tasaCompletadas },
      { Métrica: 'Tasa ausencia %', Valor: this.tasaAusencia },
    ];
    this.reporteService.exportarExcel(datos, `reporte_${this.desde()}_${this.hasta()}`);
  }

  exportarPDF(): void {
    const r = this.reporte();
    if (!r) return;
    this.reporteService.exportarPDF(
      `Reporte de clases — ${this.desde()} al ${this.hasta()}`,
      {
        headers: ['Métrica', 'Valor'],
        rows: [
          ['Total clases', String(r.totalClases)],
          ['Completadas', String(r.clasesCompletadas)],
          ['Ausentes', String(r.clasesAusentes)],
          ['Canceladas', String(r.clasesCanceladas)],
          ['Tasa completadas', `${this.tasaCompletadas}%`],
          ['Tasa ausencia', `${this.tasaAusencia}%`],
          ...r.temasFrecuentes.map(t => [`Tema: ${t.tema}`, String(t.count)]),
        ],
      },
      `reporte_${this.desde()}_${this.hasta()}`
    );
  }

  getBarWidth(val: number, max: number): string {
    if (max === 0) return '0%';
    return `${Math.round((val / max) * 100)}%`;
  }
}
