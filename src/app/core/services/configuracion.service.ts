import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ConfiguracionGlobal, ConfiguracionSucursal, PreciosOverride } from '../../shared/models';

const GLOBAL_DOC_ID = 'global';

const DEFAULT_CONFIG: Omit<ConfiguracionGlobal, 'id'> = {
  limites: {
    horasAntesParaCancelar: 24,
    minutosQrValidez: 30,
    maxReagendasPorSemana: 4,
  },
  precios: {
    planes: [],
    precioClase40min: 0,
  },
  notificaciones: {
    recordatorio24hs: true,
    recordatorio2hs: true,
    confirmacionTurno: true,
    alertaSaldoBajo: true,
    alertaVencimientoPlan: true,
  },
};

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private firestore = inject(Firestore);

  private globalRef = () => doc(this.firestore, 'configuracion', GLOBAL_DOC_ID);
  private sucursalRef = (id: string) => doc(this.firestore, 'configuracion', id);

  // ── Global ──────────────────────────────────────────────

  configuracion$(): Observable<ConfiguracionGlobal> {
    return new Observable(observer => {
      return onSnapshot(this.globalRef(), snap => {
        observer.next(snap.exists()
          ? { id: snap.id, ...snap.data() } as ConfiguracionGlobal
          : { id: GLOBAL_DOC_ID, ...DEFAULT_CONFIG });
      }, err => observer.error(err));
    });
  }

  async getOnce(): Promise<ConfiguracionGlobal> {
    const snap = await getDoc(this.globalRef());
    return snap.exists()
      ? { id: snap.id, ...snap.data() } as ConfiguracionGlobal
      : { id: GLOBAL_DOC_ID, ...DEFAULT_CONFIG };
  }

  async guardar(config: Omit<ConfiguracionGlobal, 'id'>): Promise<void> {
    const snap = await getDoc(this.globalRef());
    if (snap.exists()) {
      await updateDoc(this.globalRef(), { ...config, actualizadoEn: serverTimestamp() });
    } else {
      await setDoc(this.globalRef(), { ...config, creadoEn: serverTimestamp() });
    }
  }

  // ── Por sucursal ─────────────────────────────────────────

  async getSucursalOnce(sucursalId: string): Promise<ConfiguracionSucursal | null> {
    const snap = await getDoc(this.sucursalRef(sucursalId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as ConfiguracionSucursal : null;
  }

  async guardarSucursal(
    sucursalId: string,
    precios: PreciosOverride,
    usarPlanesBase: boolean,
    maxReagendasPorSemana?: number | null
  ): Promise<void> {
    const ref = this.sucursalRef(sucursalId);
    const snap = await getDoc(ref);
    const data: Record<string, any> = { precios, usarPlanesBase, actualizadoEn: serverTimestamp() };
    if (maxReagendasPorSemana !== undefined) data['maxReagendasPorSemana'] = maxReagendasPorSemana;
    if (snap.exists()) {
      await updateDoc(ref, data);
    } else {
      await setDoc(ref, { ...data, creadoEn: serverTimestamp() });
    }
  }

  async eliminarOverrideSucursal(sucursalId: string): Promise<void> {
    await deleteDoc(this.sucursalRef(sucursalId));
  }

  // ── Helper ────────────────────────────────────────────────

  /** Devuelve los precios efectivos: merge de sucursal + global según usarPlanesBase. */
  getPreciosEfectivos(
    global: ConfiguracionGlobal,
    override?: ConfiguracionSucursal | null
  ): ConfiguracionGlobal['precios'] {
    if (!override) return global.precios;
    const usarBase = override.usarPlanesBase !== false;
    const planesSucursal = override.precios.planes ?? [];
    const planesBase = usarBase
      ? global.precios.planes.filter(g => !planesSucursal.some(s => s.id === g.id))
      : [];
    return {
      planes:           [...planesSucursal, ...planesBase],
      precioClase40min: override.precios.precioClase40min ?? global.precios.precioClase40min,
    };
  }
}
