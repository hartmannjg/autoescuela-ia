import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { SucursalService } from '../../../core/services/sucursal.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatSelectModule, MatProgressSpinnerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private sucursalService = inject(SucursalService);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly sucursales = toSignal(this.sucursalService.sucursales$(), { initialValue: [] });

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    telefono: [''],
    sucursalId: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: this.passwordMatchValidator });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      await this.authService.register(
        this.form.value.email!,
        this.form.value.password!,
        this.form.value.nombre!,
        this.form.value.sucursalId!
      );
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al registrarse',
        text: error.code === 'auth/email-already-in-use'
          ? 'Ya existe una cuenta con ese email.'
          : error.message ?? 'Ocurrió un error.',
        confirmButtonColor: '#1a237e',
      });
    } finally {
      this.loading.set(false);
    }
  }

  private passwordMatchValidator(control: AbstractControl) {
    const pw = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    return pw === confirm ? null : { passwordMismatch: true };
  }
}
