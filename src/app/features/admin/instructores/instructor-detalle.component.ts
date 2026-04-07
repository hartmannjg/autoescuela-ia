import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-instructor-detalle', standalone: true, imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule], template: `<div class="p"><a routerLink="/admin/instructores">← Volver</a><h2>Detalle del Instructor</h2></div>`, styles: [`.p{max-width:1100px;margin:0 auto} h2{color:#37474f;margin:8px 0 0}`] })
export class InstructorDetalleComponent {}
