import { Timestamp } from '@angular/fire/firestore';

export type TipoMotor = 'correa' | 'cadena';
export type Transmision = 'manual' | 'automatico';
export type TipoCombustible = 'nafta' | 'diesel' | 'gnc' | 'electrico' | 'hibrido';

export type TipoMantenimientoAuto =
  | 'aceite'
  | 'rotacion_neumaticos'
  | 'presion_neumaticos'
  | 'correa_distribucion'
  | 'bujias'
  | 'frenos'
  | 'liquido_frenos'
  | 'liquido_refrigerante'
  | 'bateria'
  | 'escobillas'
  | 'alineacion_balanceo'
  | 'amortiguadores'
  | 'embrague'
  | 'doble_comando'
  | 'otro';

export interface MantenimientoCfg {
  label: string;
  detalle?: string;
  kmIntervalo?: number;
  diasIntervalo?: number;
  soloCorrea?: boolean;
  icon: string;
}

export const MANTENIMIENTO_CONFIG: Record<TipoMantenimientoAuto, MantenimientoCfg> = {
  aceite: {
    label: 'Cambio de aceite',
    detalle: 'Incluye filtro de aceite, filtro de aire y filtro de habitáculo',
    kmIntervalo: 10000,
    icon: 'opacity',
  },
  rotacion_neumaticos: {
    label: 'Rotación de neumáticos',
    kmIntervalo: 10000,
    icon: 'cached',
  },
  presion_neumaticos: {
    label: 'Presión de neumáticos',
    diasIntervalo: 14,
    icon: 'speed',
  },
  correa_distribucion: {
    label: 'Correa de distribución',
    kmIntervalo: 50000,
    soloCorrea: true,
    icon: 'settings',
  },
  bujias: {
    label: 'Bujías',
    kmIntervalo: 40000,
    icon: 'electric_bolt',
  },
  frenos: {
    label: 'Pastillas / zapatas de freno',
    kmIntervalo: 25000,
    icon: 'build_circle',
  },
  liquido_frenos: {
    label: 'Líquido de frenos',
    detalle: 'Inspección de nivel',
    diasIntervalo: 90,
    icon: 'water',
  },
  liquido_refrigerante: {
    label: 'Líquido refrigerante',
    detalle: 'Inspección de nivel',
    diasIntervalo: 90,
    icon: 'thermostat',
  },
  bateria: {
    label: 'Batería',
    diasIntervalo: 1095,
    icon: 'battery_charging_full',
  },
  escobillas: {
    label: 'Escobillas limpiaparabrisas',
    diasIntervalo: 270,
    icon: 'water_drop',
  },
  alineacion_balanceo: {
    label: 'Alineación y balanceo',
    kmIntervalo: 15000,
    icon: 'tune',
  },
  amortiguadores: {
    label: 'Amortiguadores',
    kmIntervalo: 60000,
    icon: 'swap_vert',
  },
  embrague: {
    label: 'Embrague',
    kmIntervalo: 40000,
    icon: 'compare_arrows',
  },
  doble_comando: {
    label: 'Doble comando',
    detalle: 'Verificar pedales del instructor',
    diasIntervalo: 180,
    icon: 'games',
  },
  otro: {
    label: 'Otro',
    icon: 'build',
  },
};

export type EstadoAlerta = 'ok' | 'proximo' | 'vencido' | 'sin_registro';

export interface AlertaMantenimiento {
  tipo: TipoMantenimientoAuto;
  label: string;
  detalle?: string;
  estado: EstadoAlerta;
  kmRestantes?: number;
  diasRestantes?: number;
  ultimaFecha?: Date;
  ultimoKm?: number;
  icon: string;
}

export interface RegistroMantenimiento {
  id?: string;
  autoId: string;
  sucursalId: string;
  tipo: TipoMantenimientoAuto;
  fecha: Timestamp;
  kmAlMomento: number;
  descripcion?: string;
  costo?: number;
  creadoEn: Timestamp;
}

export interface Auto {
  id?: string;
  sucursalId: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color?: string;
  transmision: Transmision;
  combustible: TipoCombustible;
  tipoMotor: TipoMotor;
  kmActuales: number;
  fechaKmActualizacion?: Timestamp;
  vtvVencimiento?: Timestamp | null;
  seguroVencimiento?: Timestamp | null;
  seguroPoliza?: string;
  seguroAseguradora?: string;
  activo: boolean;
  creadoEn: Timestamp;
  actualizadoEn?: Timestamp;
}
