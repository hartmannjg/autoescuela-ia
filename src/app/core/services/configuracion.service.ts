import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ConfiguracionGlobal } from '../../shared/models';

const CONFIG_DOC_ID = 'global';

const DEFAULT_CONFIG: Omit<ConfiguracionGlobal, 'id'> = {
  limites: {
    maxClasesPorSemana: 5,
    minClasesPorSemana: 0,
    semanasSinClaseParaBloqueo: 4,
    horasAntesParaCancelar: 24,
    minutosQrValidez: 30,
  },
  precios: {
    planes: [],
    paquetes: [],
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
  private docRef = () => doc(this.firestore, 'configuracion', CONFIG_DOC_ID);

  configuracion$(): Observable<ConfiguracionGlobal> {
    return new Observable(observer => {
      return onSnapshot(this.docRef(), snap => {
        if (snap.exists()) {
          observer.next({ id: snap.id, ...snap.data() } as ConfiguracionGlobal);
        } else {
          observer.next({ id: CONFIG_DOC_ID, ...DEFAULT_CONFIG });
        }
      }, err => observer.error(err));
    });
  }

  async getOnce(): Promise<ConfiguracionGlobal> {
    const snap = await getDoc(this.docRef());
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as ConfiguracionGlobal;
    }
    return { id: CONFIG_DOC_ID, ...DEFAULT_CONFIG };
  }

  async guardar(config: Omit<ConfiguracionGlobal, 'id'>): Promise<void> {
    const snap = await getDoc(this.docRef());
    if (snap.exists()) {
      await updateDoc(this.docRef(), { ...config, actualizadoEn: serverTimestamp() });
    } else {
      await setDoc(this.docRef(), { ...config, creadoEn: serverTimestamp() });
    }
  }
}
