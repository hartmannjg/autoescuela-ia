import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, addDoc, getDocs,
  deleteDoc, updateDoc, query, where, onSnapshot, serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import {
  Auto, RegistroMantenimiento, AlertaMantenimiento,
  TipoMantenimientoAuto, MANTENIMIENTO_CONFIG,
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class AutoService {
  private firestore = inject(Firestore);

  getAutos$(sucursalId: string): Observable<Auto[]> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'autos'), where('sucursalId', '==', sucursalId));
      return onSnapshot(q, snap => {
        observer.next(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as Auto))
            .sort((a, b) => a.patente.localeCompare(b.patente)),
        );
      }, err => observer.error(err));
    });
  }

  getById$(autoId: string): Observable<Auto | null> {
    return new Observable(observer => {
      return onSnapshot(doc(this.firestore, 'autos', autoId), snap => {
        observer.next(snap.exists() ? ({ id: snap.id, ...snap.data() } as Auto) : null);
      }, err => observer.error(err));
    });
  }

  getMantenimientos$(autoId: string): Observable<RegistroMantenimiento[]> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'mantenimientos'), where('autoId', '==', autoId));
      return onSnapshot(q, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroMantenimiento));
        docs.sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis());
        observer.next(docs);
      }, err => observer.error(err));
    });
  }

  getMantenimientosPorSucursal$(sucursalId: string): Observable<RegistroMantenimiento[]> {
    return new Observable(observer => {
      const q = query(collection(this.firestore, 'mantenimientos'), where('sucursalId', '==', sucursalId));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroMantenimiento)));
      }, err => observer.error(err));
    });
  }

  async crear(auto: Omit<Auto, 'id' | 'creadoEn'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, 'autos'), {
      ...auto,
      creadoEn: serverTimestamp(),
    });
    return ref.id;
  }

  async actualizar(id: string, datos: Partial<Auto>): Promise<void> {
    await updateDoc(doc(this.firestore, 'autos', id), { ...datos, actualizadoEn: serverTimestamp() });
  }

  async actualizarKm(id: string, km: number): Promise<void> {
    await updateDoc(doc(this.firestore, 'autos', id), {
      kmActuales: km,
      fechaKmActualizacion: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    });
  }

  async eliminar(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'autos', id));
    const snap = await getDocs(query(collection(this.firestore, 'mantenimientos'), where('autoId', '==', id)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  async getAutosOnce(sucursalId: string): Promise<Auto[]> {
    const snap = await getDocs(query(collection(this.firestore, 'autos'), where('sucursalId', '==', sucursalId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Auto));
  }

  async getMantenimientosPorSucursalOnce(sucursalId: string): Promise<RegistroMantenimiento[]> {
    const snap = await getDocs(query(collection(this.firestore, 'mantenimientos'), where('sucursalId', '==', sucursalId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroMantenimiento));
  }

  async registrarMantenimiento(registro: Omit<RegistroMantenimiento, 'id' | 'creadoEn'>): Promise<void> {
    await addDoc(collection(this.firestore, 'mantenimientos'), { ...registro, creadoEn: serverTimestamp() });
  }

  async eliminarMantenimiento(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'mantenimientos', id));
  }

  calcularAlertas(auto: Auto, mantenimientos: RegistroMantenimiento[]): AlertaMantenimiento[] {
    const alertas: AlertaMantenimiento[] = [];
    const hoy = new Date();
    const tipos = (Object.keys(MANTENIMIENTO_CONFIG) as TipoMantenimientoAuto[]).filter(t => t !== 'otro');

    for (const tipo of tipos) {
      const cfg = MANTENIMIENTO_CONFIG[tipo];
      if (cfg.soloCorrea && auto.tipoMotor !== 'correa') continue;

      const ultimoReg = mantenimientos
        .filter(m => m.tipo === tipo)
        .sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis())[0];

      const base = {
        tipo, label: cfg.label, detalle: cfg.detalle, icon: cfg.icon,
        ultimaFecha: ultimoReg?.fecha.toDate(),
        ultimoKm: ultimoReg?.kmAlMomento,
      };

      if (cfg.kmIntervalo) {
        if (!ultimoReg) { alertas.push({ ...base, estado: 'sin_registro' }); continue; }
        const kmRestantes = cfg.kmIntervalo - (auto.kmActuales - ultimoReg.kmAlMomento);
        const umbral = Math.max(500, cfg.kmIntervalo * 0.08);
        const estado = kmRestantes <= 0 ? 'vencido' : kmRestantes <= umbral ? 'proximo' : 'ok';
        alertas.push({ ...base, estado, kmRestantes });
        continue;
      }

      if (cfg.diasIntervalo) {
        if (!ultimoReg) { alertas.push({ ...base, estado: 'sin_registro' }); continue; }
        const diasDesde = Math.floor((hoy.getTime() - ultimoReg.fecha.toDate().getTime()) / 86400000);
        const diasRestantes = cfg.diasIntervalo - diasDesde;
        const umbral = Math.min(14, Math.floor(cfg.diasIntervalo * 0.1));
        const estado = diasRestantes <= 0 ? 'vencido' : diasRestantes <= umbral ? 'proximo' : 'ok';
        alertas.push({ ...base, estado, diasRestantes });
      }
    }

    return alertas;
  }

  contarAlertas(alertas: AlertaMantenimiento[]): { vencidas: number; proximas: number } {
    return {
      vencidas: alertas.filter(a => a.estado === 'vencido' || a.estado === 'sin_registro').length,
      proximas: alertas.filter(a => a.estado === 'proximo').length,
    };
  }

  /** Calcula días restantes hasta vencimiento de un documento (VTV/seguro). Negativo = vencido. */
  diasHastaVencimiento(ts: any): number | null {
    if (!ts) return null;
    const venc = ts.toDate ? ts.toDate() : new Date(ts);
    return Math.floor((venc.getTime() - Date.now()) / 86400000);
  }
}
