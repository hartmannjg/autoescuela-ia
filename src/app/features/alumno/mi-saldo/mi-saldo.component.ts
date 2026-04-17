import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../core/services/auth.service';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

@Component({
  selector: 'app-mi-saldo',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule, MatDividerModule, FechaHoraPipe, MonedaPipe, DuracionPipe],
  templateUrl: './mi-saldo.component.html',
  styleUrl: './mi-saldo.component.scss',
})
export class MiSaldoComponent {
  private authService = inject(AuthService);

  readonly user = this.authService.currentUser;
  readonly plan = computed(() => this.user()?.alumnoData?.planContratado);
  readonly credito = computed(() => this.user()?.alumnoData?.creditoIndividual);
  readonly progresoClases = computed(() => {
    const p = this.plan();
    if (!p || p.clasesTotales === 0) return 0;
    return Math.round((p.clasesTomadas / p.clasesTotales) * 100);
  });
  readonly saldoTotal = computed(() =>
    (this.plan()?.clasesRestantes ?? 0) + (this.credito()?.clasesDisponibles ?? 0)
  );
}
