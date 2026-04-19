export interface PreciosPlan {
  id: string;
  nombre: string;
  duracionClase: 40 | 80;
  cantidadClases: number;
  precio: number;
  activo: boolean;
  maxClasesPorDia: number | null; // null = sin límite
  maxClasesPorSemana: number;
}

/** Override de precios por sucursal. null = usar el valor global. */
export interface PreciosOverride {
  planes: PreciosPlan[] | null;
  precioClase40min: number | null;
}

export interface ConfiguracionSucursal {
  id?: string;
  precios: PreciosOverride;
  usarPlanesBase?: boolean;
  maxReagendasPorSemana?: number | null;
}

export interface ConfiguracionGlobal {
  id?: string;
  limites: {
    horasAntesParaCancelar: number;
    minutosQrValidez: number;
    maxReagendasPorSemana: number;
  };
  precios: {
    planes: PreciosPlan[];
    precioClase40min: number;
  };
  notificaciones: {
    recordatorio24hs: boolean;
    recordatorio2hs: boolean;
    confirmacionTurno: boolean;
    alertaSaldoBajo: boolean;
    alertaVencimientoPlan: boolean;
  };
}
