import { Timestamp } from '@angular/fire/firestore';

export interface ConfiguracionHorarios {
  slotBaseMinutos: 20;
  duracionesPermitidas: number[]; // [20, 40, 60]
  horarioApertura: string; // "08:00"
  horarioCierre: string;  // "20:00"
  diasLaborales: number[]; // [1,2,3,4,5,6] = Lun-Sab
}

export interface Ubicacion {
  lat: number;
  lng: number;
  radioPermitido: number; // metros
}

export interface Sucursal {
  id?: string;
  nombre: string;
  direccion: string;
  telefono: string;
  configuracionHorarios: ConfiguracionHorarios;
  ubicacion: Ubicacion;
  activo: boolean;
  creadoEn?: Timestamp;
  actualizadoEn?: Timestamp;
}
