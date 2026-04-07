import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-feriados', standalone: true, imports: [CommonModule, MatCardModule, MatIconModule], templateUrl: './feriados.component.html', styleUrl: './feriados.component.scss' })
export class FeriadosComponent {}
