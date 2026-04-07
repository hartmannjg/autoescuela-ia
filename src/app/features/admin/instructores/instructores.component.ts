import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
@Component({ selector: 'app-instructores', standalone: true, imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule], template: `<div class="p"><h2>Instructores</h2><p>Gestión de instructores</p></div>`, styles: [`.p{max-width:1200px;margin:0 auto} h2{color:#37474f;margin:0}`] })
export class InstructoresComponent {}
