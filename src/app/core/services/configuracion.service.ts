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
    semanasSinClaseParaBloqueo: 4,
    horasAntesParaCancelar: 24,
    minutosQrValidez: 30,
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

  async guardarSucursal(sucursalId: string, precios: PreciosOverride): Promise<void> {
    const ref = this.sucursalRef(sucursalId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { precios, actualizadoEn: serverTimestamp() });
    } else {
      await setDoc(ref, { precios, creadoEn: serverTimestamp() });
    }
  }

  async eliminarOverrideSucursal(sucursalId: string): Promise<void> {
    await deleteDoc(this.sucursalRef(sucursalId));
  }

  // ── Helper ────────────────────────────────────────────────

  /** Devuelve los precios efectivos: override de sucursal si existe, sino global. */
  getPreciosEfectivos(
    global: ConfiguracionGlobal,
    override?: ConfiguracionSucursal | null
  ): ConfiguracionGlobal['precios'] {
    if (!override) return global.precios;
    return {
      planes:           override.precios.planes           ?? global.precios.planes,
      precioClase40min: override.precios.precioClase40min ?? global.precios.precioClase40min,
    };
  }
}
