import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { User, UserRole } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  readonly currentUser = signal<User | null>(null);
  readonly loading = signal(true);
  readonly firebaseUser = signal<FirebaseUser | null>(null);

  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly rol = computed(() => this.currentUser()?.rol ?? null);
  readonly isAlumno = computed(() => this.rol() === 'alumno');
  readonly isInstructor = computed(() => this.rol() === 'instructor');
  readonly isAdmin = computed(() => this.rol() === 'admin' || this.rol() === 'super-admin');
  readonly isSuperAdmin = computed(() => this.rol() === 'super-admin');

  constructor() {
    onAuthStateChanged(this.auth, async (fbUser) => {
      this.firebaseUser.set(fbUser);
      if (fbUser) {
        const userData = await this.cargarUsuario(fbUser.uid);
        this.currentUser.set(userData);
      } else {
        this.currentUser.set(null);
      }
      this.loading.set(false);
    });
  }

  async login(email: string, password: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    const user = await this.cargarUsuario(cred.user.uid);
    if (!user) throw new Error('Usuario no encontrado en la base de datos.');
    if (!user.activo) throw new Error('Tu cuenta está desactivada. Contactá al administrador.');
    this.currentUser.set(user);
    this.redirectByRole(user.rol);
  }

  async register(email: string, password: string, nombre: string, sucursalId: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: nombre });

    const newUser: User = {
      uid: cred.user.uid,
      email,
      nombre,
      sucursalId,
      rol: 'alumno',
      activo: true,
      fechaAlta: serverTimestamp() as any,
      alumnoData: {
        tipoAlumno: 'individual',
        reglasAsignacion: {
          maxClasesPorSemana: 3,
          requiereMinimoSemanal: false,
          semanasSinClaseMax: 4,
          puedeAgendarSinLimite: false,
        },
        bloqueado: false,
        creditoIndividual: {
          clasesDisponibles: 0,
          clasesTomadas: 0,
          paquetesComprados: [],
        },
      },
    };

    await setDoc(doc(this.firestore, 'users', cred.user.uid), newUser);
    this.currentUser.set(newUser);
    this.router.navigate(['/alumno/dashboard']);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async cargarUsuario(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    return snap.exists() ? (snap.data() as User) : null;
  }

  async recargarUsuario(): Promise<void> {
    const uid = this.firebaseUser()?.uid;
    if (!uid) return;
    const user = await this.cargarUsuario(uid);
    this.currentUser.set(user);
  }

  private redirectByRole(rol: UserRole): void {
    switch (rol) {
      case 'alumno':
        this.router.navigate(['/alumno/dashboard']);
        break;
      case 'instructor':
        this.router.navigate(['/instructor/dashboard']);
        break;
      case 'admin':
      case 'super-admin':
        this.router.navigate(['/admin/dashboard']);
        break;
    }
  }
}
