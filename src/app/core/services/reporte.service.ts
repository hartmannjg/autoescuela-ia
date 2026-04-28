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

export interface ClaseInstructor {
  fechaStr: string;
  horaInicio: string;
  horaFin: string;
  duracionMinutos: number;
  alumnoNombre: string;
  instructorUid?: string;
  estado: string;
  motivo?: string;
}

export interface FilaInstructor {
  instructorUid: string;
  completadas: number;
  ausentes: number;
  canceladas: number;
  pendientes: number;
  totalMinutos: number;
  clases: ClaseInstructor[];
}

export interface FilaAlumno {
  alumnoUid: string;
  alumnoNombre: string;
  completadas: number;
  ausentes: number;
  canceladas: number;
  pendientes: number;
  totalMinutos: number;
  clases: ClaseInstructor[];
}

export interface FilaOcupacion {
  instructorUid: string;
  slotsDisponibles: number;
  slotsOcupados: number;
  pctOcupacion: number;
}

export interface FilaPlan {
  alumnoUid: string;
  alumnoNombre: string;
  tipoPlan: 'plan' | 'individual' | 'sin_plan';
  planNombre: string;
  valor: number;
  clasesTotales: number;
  clasesRestantes: number;
  clasesTomadas: number;
  fechaFin?: Date;
  vencido: boolean;
}

export interface FilaIngreso {
  id?: string;
  fechaStr: string;
  tipo: 'plan' | 'individual';
  alumnoUid: string;
  alumnoNombre: string;
  descripcion: string;
  monto: number;
  cantidadClases?: number;
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

  async reporteInstructoresMes(
    sucursalId: string,
    desde: string,
    hasta: string,
    filtroInstructorUid?: string
  ): Promise<FilaInstructor[]> {
    const constraints: any[] = [
      where('sucursalId', '==', sucursalId),
      where('fechaStr', '>=', desde),
      where('fechaStr', '<=', hasta),
    ];
    if (filtroInstructorUid) constraints.push(where('instructorUid', '==', filtroInstructorUid));
    const snap = await getDocs(query(collection(this.firestore, 'turnos'), ...constraints));
    const turnos = snap.docs.map(d => d.data() as Turno);

    const map = new Map<string, FilaInstructor>();
    for (const t of turnos) {
      if (!map.has(t.instructorUid)) {
        map.set(t.instructorUid, { instructorUid: t.instructorUid, completadas: 0, ausentes: 0, canceladas: 0, pendientes: 0, totalMinutos: 0, clases: [] });
      }
      const fila = map.get(t.instructorUid)!;
      fila.clases.push({ fechaStr: t.fechaStr, horaInicio: t.horaInicio, horaFin: t.horaFin ?? '', duracionMinutos: t.duracionMinutos, alumnoNombre: t.alumnoNombre ?? '', estado: t.estado, motivo: t.motivoRechazo });
      if (t.estado === 'COMPLETADA') { fila.completadas++; fila.totalMinutos += t.duracionMinutos; }
      else if (t.estado === 'AUSENTE') { fila.ausentes++; fila.totalMinutos += t.duracionMinutos; }
      else if (t.estado === 'CANCELADA') fila.canceladas++;
      else fila.pendientes++;
    }

    return [...map.values()].map(f => ({
      ...f,
      clases: f.clases.sort((a, b) => a.fechaStr.localeCompare(b.fechaStr) || a.horaInicio.localeCompare(b.horaInicio)),
    }));
  }

  async reporteAlumnosMes(sucursalId: string, desde: string, hasta: string): Promise<FilaAlumno[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'turnos'),
      where('sucursalId', '==', sucursalId),
      where('fechaStr', '>=', desde),
      where('fechaStr', '<=', hasta)
    ));
    const turnos = snap.docs.map(d => d.data() as Turno);

    const map = new Map<string, FilaAlumno>();
    for (const t of turnos) {
      if (!t.alumnoUid) continue;
      if (!map.has(t.alumnoUid)) {
        map.set(t.alumnoUid, { alumnoUid: t.alumnoUid, alumnoNombre: t.alumnoNombre ?? '', completadas: 0, ausentes: 0, canceladas: 0, pendientes: 0, totalMinutos: 0, clases: [] });
      }
      const fila = map.get(t.alumnoUid)!;
      fila.clases.push({ fechaStr: t.fechaStr, horaInicio: t.horaInicio, horaFin: t.horaFin ?? '', duracionMinutos: t.duracionMinutos, alumnoNombre: t.alumnoNombre ?? '', instructorUid: t.instructorUid, estado: t.estado, motivo: t.motivoRechazo });
      if (t.estado === 'COMPLETADA') { fila.completadas++; fila.totalMinutos += t.duracionMinutos; }
      else if (t.estado === 'AUSENTE')    { fila.ausentes++;   fila.totalMinutos += t.duracionMinutos; }
      else if (t.estado === 'CANCELADA')    fila.canceladas++;
      else fila.pendientes++;
    }
    return [...map.values()]
      .map(f => ({ ...f, clases: f.clases.sort((a, b) => a.fechaStr.localeCompare(b.fechaStr) || a.horaInicio.localeCompare(b.horaInicio)) }))
      .sort((a, b) => a.alumnoNombre.localeCompare(b.alumnoNombre));
  }

  async reporteOcupacion(sucursalId: string, mesInicio: string, mesFin: string, instructores: User[]): Promise<FilaOcupacion[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'turnos'),
      where('sucursalId', '==', sucursalId),
      where('fechaStr', '>=', mesInicio),
      where('fechaStr', '<=', mesFin)
    ));
    const turnos = snap.docs.map(d => d.data() as Turno);

    const ocupadoMap = new Map<string, number>();
    for (const t of turnos) {
      if (['COMPLETADA', 'AUSENTE', 'CONFIRMADA', 'PENDIENTE_CONFIRMACION'].includes(t.estado)) {
        ocupadoMap.set(t.instructorUid, (ocupadoMap.get(t.instructorUid) ?? 0) + 1);
      }
    }

    const SLOT = 40;
    const [y, m] = mesInicio.split('-').map(Number);
    const diasEnMes = new Date(y, m, 0).getDate();
    const result: FilaOcupacion[] = [];

    for (const inst of instructores) {
      if (!inst.instructorData?.activo) continue;
      const horarios = inst.instructorData?.horariosDisponibles ?? [];
      let totalSlots = 0;
      for (let d = 1; d <= diasEnMes; d++) {
        const diaSemana = new Date(y, m - 1, d).getDay();
        const h = horarios.find(x => x.dia === diaSemana);
        if (!h) continue;
        const [hI, mI] = h.horaInicio.split(':').map(Number);
        const [hF, mF] = h.horaFin.split(':').map(Number);
        totalSlots += Math.floor(((hF * 60 + mF) - (hI * 60 + mI)) / SLOT);
      }
      const ocupados = ocupadoMap.get(inst.uid) ?? 0;
      result.push({ instructorUid: inst.uid, slotsDisponibles: totalSlots, slotsOcupados: Math.min(ocupados, totalSlots), pctOcupacion: totalSlots === 0 ? 0 : Math.round((Math.min(ocupados, totalSlots) / totalSlots) * 100) });
    }
    return result.sort((a, b) => b.pctOcupacion - a.pctOcupacion);
  }

  reporteEstadoPlanes(alumnos: User[]): FilaPlan[] {
    const hoy = new Date();
    const result: FilaPlan[] = [];
    for (const a of alumnos) {
      const plan   = a.alumnoData?.planContratado;
      const credito = a.alumnoData?.creditoIndividual;
      if (plan) {
        const fechaFin = (plan.fechaFin as any)?.toDate?.() as Date | undefined;
        result.push({ alumnoUid: a.uid, alumnoNombre: a.nombre, tipoPlan: 'plan', planNombre: plan.nombre, valor: plan.valor, clasesTotales: plan.clasesTotales, clasesRestantes: plan.clasesRestantes, clasesTomadas: plan.clasesTomadas, fechaFin, vencido: fechaFin ? fechaFin < hoy : false });
      } else if (credito) {
        result.push({ alumnoUid: a.uid, alumnoNombre: a.nombre, tipoPlan: 'individual', planNombre: 'Crédito individual', valor: 0, clasesTotales: credito.clasesTomadas + credito.clasesDisponibles, clasesRestantes: credito.clasesDisponibles, clasesTomadas: credito.clasesTomadas, vencido: false });
      } else {
        result.push({ alumnoUid: a.uid, alumnoNombre: a.nombre, tipoPlan: 'sin_plan', planNombre: '—', valor: 0, clasesTotales: 0, clasesRestantes: 0, clasesTomadas: 0, vencido: false });
      }
    }
    return result.sort((a, b) => a.alumnoNombre.localeCompare(b.alumnoNombre));
  }

  async reporteIngresos(sucursalId: string, desde: string, hasta: string): Promise<FilaIngreso[]> {
    const snap = await getDocs(query(
      collection(this.firestore, 'cobros'),
      where('sucursalId', '==', sucursalId),
      where('fechaStr', '>=', desde),
      where('fechaStr', '<=', hasta)
    ));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id,
        fechaStr: data.fechaStr,
        tipo: data.tipo,
        alumnoUid: data.alumnoUid,
        alumnoNombre: data.alumnoNombre,
        descripcion: data.descripcion,
        monto: data.monto ?? 0,
        cantidadClases: data.cantidadClases,
      } as FilaIngreso;
    }).sort((a, b) => a.fechaStr.localeCompare(b.fechaStr));
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

  exportarExcelMultiHoja(hojas: { nombre: string; datos: any[] }[], nombreArchivo: string): void {
    const wb = XLSX.utils.book_new();
    for (const h of hojas) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.datos), h.nombre);
    }
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
  }

  exportarPDFInstructores(
    titulo: string,
    secciones: {
      nombre: string;
      completadas: number; ausentes: number; canceladas: number; horas: string;
      clases: { fecha: string; horario: string; duracion: string; alumno: string; estado: string; motivo: string }[];
    }[],
    totales: { completadas: number; ausentes: number; canceladas: number; horas: string },
    nombreArchivo: string
  ): void {
    const pdf = new jsPDF({ orientation: 'landscape' });
    const PW = 277; // landscape page width
    const ML = 10; // margin left
    const MR = 267; // margin right
    let y = 15;

    const newPage = () => { pdf.addPage(); y = 15; };
    const checkY = (needed = 10) => { if (y + needed > 195) newPage(); };

    // Title
    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
    pdf.text(titulo, ML, y); y += 8;

    // KPIs line
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Completadas: ${totales.completadas}   Ausencias alumno: ${totales.ausentes}   Canceladas: ${totales.canceladas}   Horas impartidas: ${totales.horas}`,
      ML, y
    ); y += 6;
    pdf.line(ML, y, MR, y); y += 5;

    // Column widths (landscape 277mm usable)
    const cols = [30, 28, 40, 55, 28, 50]; // fecha, horario, duracion, alumno, estado, motivo
    const headers = ['Fecha', 'Horario', 'Duración', 'Alumno', 'Estado', 'Motivo cancelación'];

    const drawTableHeader = () => {
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
      let x = ML;
      headers.forEach((h, i) => { pdf.text(h, x, y); x += cols[i]; });
      y += 3; pdf.line(ML, y, MR, y); y += 4;
      pdf.setFont('helvetica', 'normal');
    };

    for (const sec of secciones) {
      checkY(16);
      // Instructor header
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
      pdf.text(`${sec.nombre}`, ML, y);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
      pdf.text(
        `  —  Completadas: ${sec.completadas}  |  Ausencias: ${sec.ausentes}  |  Canceladas: ${sec.canceladas}  |  Horas: ${sec.horas}`,
        ML + 2, y
      );
      y += 5;
      drawTableHeader();

      for (const c of sec.clases) {
        checkY(6);
        let x = ML;
        const cells = [c.fecha, c.horario, c.duracion, c.alumno, c.estado, c.motivo];
        pdf.setFontSize(8);
        cells.forEach((cell, i) => {
          const maxW = cols[i] - 2;
          const txt = pdf.splitTextToSize(cell, maxW)[0] ?? '';
          pdf.text(txt, x, y);
          x += cols[i];
        });
        y += 6;
      }

      y += 2; pdf.line(ML, y, MR, y); y += 5;
    }

    // Totals
    checkY(10);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.text(
      `TOTAL — Completadas: ${totales.completadas}  |  Ausencias: ${totales.ausentes}  |  Canceladas: ${totales.canceladas}  |  Horas: ${totales.horas}`,
      ML, y
    );

    pdf.save(`${nombreArchivo}.pdf`);
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
