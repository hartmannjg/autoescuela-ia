import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  getDocs,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Notificacion, TipoNotificacion } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'notificaciones');

  notificaciones$(userId: string): Observable<Notificacion[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('userId', '==', userId),
        orderBy('creadoEn', 'desc')
      );
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Notificacion));
      }, err => observer.error(err));
    });
  }

  noLeidas$(userId: string): Observable<number> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('userId', '==', userId),
        where('leida', '==', false)
      );
      return onSnapshot(q, snap => {
        observer.next(snap.size);
      }, err => observer.error(err));
    });
  }

  noLeidasLista$(userId: string): Observable<Notificacion[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('userId', '==', userId),
        where('leida', '==', false),
        orderBy('creadoEn', 'desc')
      );
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Notificacion));
      }, err => observer.error(err));
    });
  }

  async enviar(
    userId: string,
    tipo: TipoNotificacion,
    titulo: string,
    mensaje: string,
    turnoId?: string
  ): Promise<void> {
    const notif: Omit<Notificacion, 'id'> = {
      userId,
      tipo,
      titulo,
      mensaje,
      leida: false,
      ...(turnoId ? { turnoId } : {}),
      creadoEn: serverTimestamp() as any,
    };
    await addDoc(this.colRef(), notif);
  }

  async marcarLeida(notifId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'notificaciones', notifId), { leida: true });
  }

  async marcarTodasLeidas(userId: string): Promise<void> {
    const q = query(this.colRef(), where('userId', '==', userId), where('leida', '==', false));
    const snap = await getDocs(q);
    const batch = writeBatch(this.firestore);
    snap.docs.forEach(d => batch.update(d.ref, { leida: true }));
    await batch.commit();
  }
}
