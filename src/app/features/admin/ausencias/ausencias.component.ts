import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-ausencias', standalone: true, imports: [CommonModule, MatCardModule, MatIconModule], templateUrl: './ausencias.component.html', styleUrl: './ausencias.component.scss' })
export class AusenciasComponent {}
