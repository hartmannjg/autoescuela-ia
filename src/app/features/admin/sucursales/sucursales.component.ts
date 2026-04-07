import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-sucursales', standalone: true, imports: [CommonModule, MatCardModule, MatIconModule], templateUrl: './sucursales.component.html', styleUrl: './sucursales.component.scss' })
export class SucursalesComponent {}
