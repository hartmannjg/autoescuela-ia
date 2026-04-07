import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from '@angular/fire/firestore';
import { Turno, User } from '../../shared/models';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

export interface ReporteClases {
  totalClases: number;
  clasesCompletadas: number;
  clasesAusentes: number;
  clasesCanceladas: number;
  porInstructor: { nombre: string; total: number }[];
  temasFrecuentes: { tema: string; count: number }[];
}

export interface ReporteAlumno {
  alumno: User;
  totalClases: number;
  progresoNivel: { fecha: string; nivel: number }[];
  aptoParaExamen: boolean;
  ultimaClaseFecha?: string;
}

@Injectable({ providedIn: 'root' })
export class ReporteService {
  private firestore = inject(Firestore);

  async reporteClasesPorPeriodo(
    sucursalId: string,
    desde: string,
    hasta: string
  ): Promise<ReporteClases> {
    const q = query(
      collection(this.firestore, 'turnos'),
      where('sucursalId', '==', sucursalId),
      where('fechaStr', '>=', desde),
      where('fechaStr', '<=', hasta)
    );
    const snap = await getDocs(q);
    const turnos = snap.docs.map(d => d.data() as Turno);

    const porInstructorMap = new Map<string, number>();
    const temasMap = new Map<string, number>();

    turnos.forEach(t => {
      if (t.instructorUid) {
        porInstructorMap.set(t.instructorUid, (porInstructorMap.get(t.instructorUid) ?? 0) + 1);
      }
      if (t.temaClase) {
        temasMap.set(t.temaClase, (temasMap.get(t.temaClase) ?? 0) + 1);
      }
    });

    return {
      totalClases: turnos.length,
      clasesCompletadas: turnos.filter(t => t.estado === 'COMPLETADA').length,
      clasesAusentes: turnos.filter(t => t.estado === 'AUSENTE').length,
      clasesCanceladas: turnos.filter(t => t.estado === 'CANCELADA').length,
      porInstructor: [...porInstructorMap.entries()].map(([nombre, total]) => ({ nombre, total })),
      temasFrecuentes: [...temasMap.entries()]
        .map(([tema, count]) => ({ tema, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async alumnosListosParaExamen(sucursalId: string): Promise<string[]> {
    const q = query(
      collection(this.firestore, 'feedbacks'),
      where('sucursalId', '==', sucursalId),
      where('instructorFeedback.aptoParaExamen', '==', true)
    );
    const snap = await getDocs(q);
    const uids = new Set<string>();
    snap.docs.forEach(d => uids.add((d.data() as any).alumnoUid));
    return [...uids];
  }

  exportarExcel(datos: any[], nombreArchivo: string): void {
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
  }

  exportarPDF(titulo: string, datos: { headers: string[]; rows: string[][] }, nombreArchivo: string): void {
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(titulo, 20, 20);
    pdf.setFontSize(10);

    let y = 35;
    const colWidth = 180 / datos.headers.length;

    // Headers
    datos.headers.forEach((h, i) => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(h, 20 + i * colWidth, y);
    });

    y += 7;
    pdf.line(20, y, 190, y);
    y += 5;

    // Rows
    pdf.setFont('helvetica', 'normal');
    datos.rows.forEach(row => {
      row.forEach((cell, i) => {
        pdf.text(String(cell ?? ''), 20 + i * colWidth, y);
      });
      y += 7;
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
    });

    pdf.save(`${nombreArchivo}.pdf`);
  }
}
