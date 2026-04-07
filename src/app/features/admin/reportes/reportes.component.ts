import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-reportes', standalone: true, imports: [CommonModule, MatCardModule, MatIconModule], templateUrl: './reportes.component.html', styleUrl: './reportes.component.scss' })
export class ReportesComponent {}
