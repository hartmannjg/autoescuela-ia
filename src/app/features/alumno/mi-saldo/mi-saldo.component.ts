import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';

interface Paquete { id: string; label: string; clases: number; precio: number; }

@Component({
  selector: 'app-mi-saldo',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatDividerModule, MatChipsModule, FechaHoraPipe, MonedaPipe],
  templateUrl: './mi-saldo.component.html',
  styleUrl: './mi-saldo.component.scss',
})
export class MiSaldoComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  readonly loading = signal(false);

  readonly user = this.authService.currentUser;
  readonly plan = computed(() => this.user()?.alumnoData?.planContratado);
  readonly credito = computed(() => this.user()?.alumnoData?.creditoIndividual);
  readonly progresoClases = computed(() => {
    const p = this.plan();
    if (!p) return 0;
    return Math.round((p.clasesTomadas / p.clasesTotales) * 100);
  });

  readonly paquetes: Paquete[] = [
    { id: 'p5', label: 'Pack 5 clases', clases: 5, precio: 25000 },
    { id: 'p10', label: 'Pack 10 clases', clases: 10, precio: 45000 },
    { id: 'p15', label: 'Pack 15 clases', clases: 15, precio: 60000 },
  ];

  async comprarPaquete(paquete: Paquete): Promise<void> {
    const result = await Swal.fire({
      title: paquete.label,
      html: `<p>Precio: <strong>${paquete.precio.toLocaleString('es-AR')}</strong></p><p>Esto agregará <strong>${paquete.clases} clases</strong> a tu saldo.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar compra',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1a237e',
    });
    if (!result.isConfirmed) return;
    this.loading.set(true);
    try {
      await this.usuarioService.recargarCredito(this.user()!.uid, paquete.clases);
      await this.authService.recargarUsuario();
      Swal.fire({ icon: 'success', title: '¡Compra exitosa!', text: `Se agregaron ${paquete.clases} clases a tu saldo.`, confirmButtonColor: '#1a237e' });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message, confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }
}
