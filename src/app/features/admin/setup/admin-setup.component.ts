import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { SucursalService } from '../../../core/services/sucursal.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { Sucursal } from '../../../shared/models';

@Component({
  selector: 'app-admin-setup',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatDividerModule, MatProgressSpinnerModule,
  ],
  templateUrl: './admin-setup.component.html',
  styleUrl: './admin-setup.component.scss',
})
export class AdminSetupComponent implements OnInit {
  private authService = inject(AuthService);
  private sucursalService = inject(SucursalService);
  private usuarioService = inject(UsuarioService);
  readonly router = inject(Router);
  private fb = inject(FormBuilder);

  readonly sucursales = signal<Sucursal[]>([]);
  readonly loading = signal(true);
  readonly guardando = signal(false);
  readonly mostrarFormNueva = signal(false);

  readonly currentUser = this.authService.currentUser;
  readonly sucursalActualId = computed(() => this.currentUser()?.sucursalId ?? '');

  form = this.fb.group({
    nombre:               ['', [Validators.required, Validators.minLength(3)]],
    direccion:            ['', Validators.required],
    telefono:             ['', Validators.required],
    horarioApertura:      ['08:00', Validators.required],
    horarioCierre:        ['20:00', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    const snap = await this.sucursalService.todasLasSucursalesOnce();
    this.sucursales.set(snap);
    this.loading.set(false);
    if (snap.length === 0) this.mostrarFormNueva.set(true);
  }

  esActual(s: Sucursal): boolean {
    return s.id === this.sucursalActualId();
  }

  async seleccionar(sucursal: Sucursal): Promise<void> {
    if (this.esActual(sucursal)) {
      this.router.navigate(['/admin/dashboard']);
      return;
    }
    this.guardando.set(true);
    try {
      const uid = this.currentUser()!.uid;
      await this.usuarioService.actualizar(uid, { sucursalId: sucursal.id! });
      await this.authService.recargarUsuario();
      this.router.navigate(['/admin/dashboard']);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async crearYSeleccionar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.guardando.set(true);
    try {
      const id = await this.sucursalService.crear({
        nombre:    v.nombre!,
        direccion: v.direccion!,
        telefono:  v.telefono!,
        activo:    true,
        ubicacion: { lat: 0, lng: 0, radioPermitido: 200 },
        configuracionHorarios: {
          slotBaseMinutos:      20,
          duracionesPermitidas: [20, 40, 60],
          horarioApertura:      v.horarioApertura!,
          horarioCierre:        v.horarioCierre!,
          diasLaborales:        [1, 2, 3, 4, 5, 6],
        },
      });
      const uid = this.currentUser()!.uid;
      await this.usuarioService.actualizar(uid, { sucursalId: id });
      await this.authService.recargarUsuario();
      this.router.navigate(['/admin/dashboard']);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async logout(): Promise<void> { await this.authService.logout(); }
}
