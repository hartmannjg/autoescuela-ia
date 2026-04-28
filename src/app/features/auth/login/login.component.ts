import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  readonly loading = signal(false);
  readonly showPassword = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      await this.authService.login(this.form.value.email!, this.form.value.password!);
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error al iniciar sesión',
        text: this.getErrorMessage(error.code ?? error.message),
        background: '#1a0a20',
        color: '#ffc400',
        confirmButtonColor: '#c62828',
        iconColor: '#e64a19',
      });
    } finally {
      this.loading.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    const { value: email } = await Swal.fire({
      title: 'Recuperar contraseña',
      input: 'email',
      inputLabel: 'Tu email',
      inputPlaceholder: 'ejemplo@correo.com',
      confirmButtonText: 'Enviar',
      confirmButtonColor: '#c62828',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      background: '#1a0a20',
      color: '#ffc400',
      customClass: {
        input: 'swal-input-sunset',
        inputLabel: 'swal-label-sunset',
      },
    });
    if (email) {
      await this.authService.resetPassword(email);
      Swal.fire({
        icon: 'success',
        title: 'Email enviado',
        text: 'Revisá tu bandeja de entrada.',
        confirmButtonColor: '#c62828',
        background: '#1a0a20',
        color: '#ffc400',
        iconColor: '#ffc400',
      });
    }
  }

  private getErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      'auth/user-not-found': 'No existe una cuenta con ese email.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/too-many-requests': 'Demasiados intentos. Intentá más tarde.',
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
    };
    return messages[code] ?? 'Email o contraseña incorrectos.';
  }
}
