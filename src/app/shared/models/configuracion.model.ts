export interface PreciosPlan {
  id: string;
  nombre: string;
  duracionMinutos: 30 | 45 | 60;
  cantidadClases: number;
  precio: number;
  activo: boolean;
}

export interface PreciosPaquete {
  id: string;
  cantidadClases: number;
  precio: number;
  activo: boolean;
}

export interface ConfiguracionGlobal {
  id?: string;
  limites: {
    maxClasesPorSemana: number;
    minClasesPorSemana: number;
    semanasSinClaseParaBloqueo: number;
    horasAntesParaCancelar: number;
    minutosQrValidez: number; // antes y después de la clase
  };
  precios: {
    planes: PreciosPlan[];
    paquetes: PreciosPaquete[];
  };
  notificaciones: {
    recordatorio24hs: boolean;
    recordatorio2hs: boolean;
    confirmacionTurno: boolean;
    alertaSaldoBajo: boolean;
    alertaVencimientoPlan: boolean;
  };
}
