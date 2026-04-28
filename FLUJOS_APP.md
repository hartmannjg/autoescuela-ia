# Flujos de la aplicación — AutoEscuela IA

> Diagramas generados: 2026-04-26  
> Renderizar con: VS Code + extensión "Markdown Preview Mermaid Support", GitHub, o Obsidian.

---

## 1. Mapa de roles y pantallas

```mermaid
graph TD
    Login[/login] --> A{Rol del usuario}

    A -->|alumno| AL[Layout Alumno]
    A -->|instructor| IN[Layout Instructor]
    A -->|admin| AD[Layout Admin]
    A -->|super-admin| SAD[Layout Admin\n+ opciones extra]

    AL --> AL1[Mi Cuenta / Dashboard]
    AL --> AL2[Calendario]
    AL --> AL3[Mis Turnos]
    AL --> AL4[Escanear QR]
    AL --> AL5[Mi Saldo]
    AL --> AL6[Historial]
    AL --> AL7[Calificar Clases]
    AL --> AL8[Asignación masiva]

    IN --> IN1[Mi Cuenta / Dashboard]
    IN --> IN2[Mi Agenda]
    IN --> IN3[Marcar Asistencia]
    IN --> IN4[Mi Disponibilidad]

    AD --> AD1[Principal / Dashboard]
    AD --> AD2[Alumnos]
    AD --> AD3[Instructores]
    AD --> AD4[Clases y turnos]
    AD --> AD5[Asignar clases]
    AD --> AD6[Reportes]
    AD --> AD7[Ausencias]
    AD --> AD8[Feriados]
    AD --> AD9[Configuración]

    SAD --> SAD1[Sucursales]
    SAD --> SAD2[Administradores]
    SAD --> SAD3[Cambiar sucursal]
```

---

## 2. Estados de un turno — máquina de estados

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE_CONFIRMACION : Alumno agenda\n(saldo descontado)

    PENDIENTE_CONFIRMACION --> CONFIRMADA : Instructor confirma
    PENDIENTE_CONFIRMACION --> RECHAZADA : Instructor rechaza\n(saldo devuelto)
    PENDIENTE_CONFIRMACION --> CANCELADA : Alumno cancela >24hs antes\n(saldo devuelto)
    PENDIENTE_CONFIRMACION --> CANCELADA : Auto: inicio pasó sin confirmar\n(saldo devuelto)

    CONFIRMADA --> COMPLETADA : Instructor valida\nasistencia (QR o manual)
    CONFIRMADA --> AUSENTE : Auto: venció sin validación\n(saldo descontado igual)
    CONFIRMADA --> CANCELADA : Alumno cancela >24hs antes\n(saldo devuelto)
    CONFIRMADA --> CANCELADA : Admin cancela por ausencia/feriado\n(saldo devuelto)

    COMPLETADA --> [*]
    AUSENTE --> [*]
    RECHAZADA --> [*]
    CANCELADA --> [*]

    note right of PENDIENTE_CONFIRMACION
        saldoDescontado = true
        asistenciaVerificada = false
    end note

    note right of COMPLETADA
        saldoDescontado = true
        asistenciaVerificada = true
        instructor.clasesDictadas += 1
    end note

    note right of AUSENTE
        saldoDescontado = true
        asistenciaVerificada = false
        instructor.clasesDictadas SIN cambio
    end note
```

> ⚠️ **Estado REPROGRAMADA**: definido en el tipo `TurnoEstado` pero nunca usado en el código. Pendiente de decidir si se implementa o se elimina del modelo.

---

## 3. Flujo completo de reserva de clase (alumno)

```mermaid
flowchart TD
    A([Alumno en Calendario]) --> B{¿Tiene plan\ny crédito?}
    B -->|Solo plan| C[Usa plan\nduracion = plan.duracionClase]
    B -->|Solo crédito| D[Usa crédito\nduracion = 40 min]
    B -->|Ambos| E[Elige fuente\nPlan o Crédito Individual]
    E --> F{Crédito elegido\n¿múltiples duraciones?}
    F -->|Sí| G[Elige duración\n40 / 60 / 80 min]
    F -->|No| C
    C & D & G --> H[Elige instructor]

    H --> I[Elige semana / día]
    I --> J[Sistema calcula slots disponibles]
    J --> K{¿Hay slots?}
    K -->|No| L[Muestra 'Sin disponibilidad']
    K -->|Sí| M[Elige horario]

    M --> N[Confirma reserva]
    N --> O{Validaciones pre-transacción}

    O --> O1{¿Slot libre?}
    O --> O2{¿Saldo suficiente?}
    O --> O3{¿Plan no vencido?}
    O --> O4{¿Bajo límite\nde reagendas?}
    O --> O5{¿Bajo límite\nclases/día y semana?}

    O1 & O2 & O3 & O4 & O5 -->|Todo OK| P[Transacción Firestore]

    P --> P1[Descuenta saldo alumno]
    P --> P2[Crea turno\nPENDIENTE_CONFIRMACION]
    P --> P3[Notifica al instructor]

    P1 & P2 & P3 --> Q([Clase agendada ✓])

    O1 -->|Ocupado| ERR1[Error: slot tomado]
    O2 -->|Sin saldo| ERR2[Error: sin clases disponibles]
    O3 -->|Vencido| ERR3[Error: plan vencido]
    O4 -->|Límite| ERR4[Error: límite de reagendas]
    O5 -->|Límite| ERR5[Error: límite diario/semanal]
```

---

## 4. Flujo de confirmación y asistencia (instructor)

```mermaid
flowchart TD
    A([Instructor recibe notificación]) --> B[Ve solicitud en Mi Agenda]

    B --> C{Decisión}
    C -->|Confirma| D[Estado → CONFIRMADA\nNotifica alumno]
    C -->|Rechaza| E[Ingresa motivo\n¿sugiere horario alternativo?]
    E --> F[Estado → RECHAZADA\nSaldo devuelto al alumno\nNotifica alumno]

    D --> G([Día de la clase])
    G --> H[Instructor en Marcar Asistencia]
    H --> I{Método}

    I -->|QR| J[Genera QR con turnoId]
    J --> K[Alumno escanea con /escanear-qr]
    K --> L{¿QR válido?\n¿dentro del horario?}
    L -->|Sí| M[completarClase - método QR]
    L -->|No| ERR[Error: QR inválido o fuera de plazo]

    I -->|Manual| N[Instructor confirma presencia]
    N --> M

    M --> O[Estado → COMPLETADA\nInstructor clasesDictadas +1\nNotifica alumno]

    G --> P{¿Venció sin validación?\n horaFin + 60 min}
    P -->|Sí| Q[Auto-proceso: AUSENTE\nSaldo descontado\nInstructor NO suma clasesDictadas]
```

---

## 5. Flujo de ausencia del instructor (admin)

```mermaid
flowchart TD
    A([Instructor registra ausencia\nen Mi Disponibilidad]) --> B[Ausencia en estado PENDIENTE]

    B --> C[Admin ve listado en /admin/ausencias]
    C --> D{Decisión del admin}

    D -->|Rechaza| E[Estado → RECHAZADA\nNo afecta clases]

    D -->|Aprueba| F[Estado → APROBADA]
    F --> G{¿Día completo\no parcial?}

    G -->|Día completo| H[Cancela TODOS los turnos\ndel instructor en esas fechas]
    G -->|Parcial - slots específicos| I[Cancela solo turnos\nen los horarios marcados]

    H & I --> J[Por cada turno cancelado:\n- Estado → CANCELADA\n- Saldo devuelto al alumno\n- Notificación al alumno]

    D -->|Asigna reemplazo| K[Elige instructor sustituto]
    K --> L[asignarReemplazo - método]
    L --> M[⚠️ Implementación incompleta:\n¿Se reasignan los turnos?\n¿Se notifica al alumno?]
```

> ⚠️ **Gap detectado**: el método `asignarReemplazo` existe pero no reasigna los turnos existentes ni notifica a los alumnos afectados. Si se va a usar esta funcionalidad, hay que completarla.

---

## 6. Procesos automáticos y cuándo corren

```mermaid
flowchart TD
    subgraph AHORA["HOY — Client-side (solo cuando el admin se loguea)"]
        AdminLogin([Admin abre la app]) --> P[procesarClasesVencidas]
        P --> P1{Por cada turno CONFIRMADA\ncuyo horaFin + 60min ya pasó}
        P1 -->|asistenciaVerificada = true| COMP[→ COMPLETADA\nDescuenta saldo]
        P1 -->|asistenciaVerificada = false| AUS[→ AUSENTE\nDescuenta saldo]

        P --> P2{Por cada PENDIENTE_CONFIRMACION\ncuyo inicio ya pasó}
        P2 --> CANC[→ CANCELADA\nDevuelve saldo\nNotifica alumno e instructor]
    end

    subgraph BLAZE["CON PLAN BLAZE — Cloud Functions automáticas"]
        SCHED1[⏰ Cada hora] --> CF1[completarClasesVencidas\nMisma lógica que arriba]
        SCHED2[⏰ Diaria 7:00 AM] --> CF2[cancelarPendientesSinRespuesta\nPENDIENTE > 24hs → CANCELADA]
        SCHED3[⏰ Lunes 8:00 AM] --> CF3[bloquearAlumnosInactivos\nSin clases en N semanas → bloqueado]
        SCHED4[⏰ Lunes 9:00 AM] --> CF4[penalizarInactividadSemanal\n1ra semana: advertencia\n2da+ semana: descuenta 1 clase]
        SCHED5[⏰ Diaria 9:00 AM] --> CF5[enviarRecordatorios24hs\nNotifica turnos del día siguiente]

        TRIGGER1[📄 Trigger: turno cambia estado] --> CF6[onTurnoEstadoCambio\nEnvía notificaciones según estado]
        TRIGGER2[📄 Trigger: nuevo feedback] --> CF7[recalcularValoracionInstructor\nPromedia puntuaciones]
        TRIGGER3[📄 Trigger: nueva notificación] --> CF8[onNotificacionCreada\nEnvía email via extensión]
    end
```

> ⚠️ **Inconsistencia detectada**: la Cloud Function `cancelarPendientesSinRespuesta` cancela si `creadoEn < hace 24hs`, pero el cliente cancela si `inicioYaPaso` (la hora de inicio pasó). Son reglas distintas. Definir cuál aplica antes de deployar.

---

## 7. Ciclo de vida del alumno

```mermaid
stateDiagram-v2
    [*] --> Activo : Admin crea cuenta\no alumno se registra

    Activo --> SinSaldo : Plan vencido\no clasesRestantes = 0
    Activo --> Bloqueado : Admin bloquea\no inactividad automática\n(N semanas sin agendar)

    SinSaldo --> Activo : Admin asigna nuevo plan\no carga créditos individuales

    Bloqueado --> Activo : Admin desbloquea

    Activo --> Activo : Agenda clases\nToma clases\nRecibe feedback

    note right of SinSaldo
        Puede ver historial
        No puede agendar
        Alerta en dashboard
    end note

    note right of Bloqueado
        No puede agendar
        Alerta en dashboard
        Admin recibe notificación
    end note
```

---

## 8. Flujo de notificaciones

```mermaid
flowchart LR
    subgraph ORIGEN["Origen"]
        EV1[Alumno agenda]
        EV2[Instructor confirma]
        EV3[Instructor rechaza]
        EV4[Clase completada]
        EV5[Clase ausente/auto]
        EV6[Admin cancela por ausencia]
        EV7[Alumno inactivo]
        EV8[Día anterior a la clase]
        EV9[Saldo bajo / plan vence]
    end

    subgraph CANAL["Canal"]
        IN_APP[In-app\nnotificaciones/]
        EMAIL[Email\nTrigger Email ext.]
    end

    subgraph DEST["Destinatario"]
        ALUMNO[Alumno]
        INST[Instructor]
    end

    EV1 -->|nueva_solicitud| IN_APP --> INST
    EV2 -->|confirmacion_turno| IN_APP --> ALUMNO
    EV3 -->|rechazo_turno| IN_APP --> ALUMNO
    EV4 -->|clase_completada| IN_APP --> ALUMNO
    EV5 -.->|⚠️ NO enviada actualmente| ALUMNO
    EV6 -->|cancelacion_turno| IN_APP --> ALUMNO
    EV7 -->|bloqueo_cuenta / saldo_bajo| IN_APP --> ALUMNO
    EV8 -->|recordatorio_turno| IN_APP --> ALUMNO
    EV9 -->|plan_vencimiento / saldo_bajo| IN_APP --> ALUMNO
    IN_APP -.->|Cloud Function trigger| EMAIL
```

> ⚠️ **Gap detectado**: cuando una clase pasa a AUSENTE por vencimiento automático, el alumno **no recibe notificación**. Solo se notifica cuando un PENDIENTE se cancela por falta de confirmación del instructor. Agregar notificación en `marcarAusente()`.

---

## 9. Lógica de saldo — resumen visual

```mermaid
flowchart TD
    AG[Alumno agenda clase] -->|Transacción| D1[clasesRestantes -1\nclasesTomadas +1\nsaldoDescontado = true]

    D1 --> EST{¿Qué pasa con la clase?}

    EST -->|Completada| C1[Saldo ya descontado\nInstructor +1 clase dictada\n✅ Sin cambio de saldo]
    EST -->|Ausente auto| C2[Saldo ya descontado\n✅ Sin cambio de saldo\n❌ Instructor no suma]
    EST -->|Rechazada por instructor| C3[clasesRestantes +1\nclasesTomadas -1\n✅ Saldo devuelto]
    EST -->|Cancelada por alumno| C4[clasesRestantes +1\nclasesTomadas -1\n✅ Saldo devuelto\n⚠️ Cuenta como reagenda]
    EST -->|Cancelada por admin/evento| C5[clasesRestantes +1\nclasesTomadas -1\n✅ Saldo devuelto\n✅ No cuenta como reagenda]
```

---

## 10. Gaps y comportamientos a revisar

| # | Descripción | Impacto | Estado |
|---|---|---|---|
| 1 | ~~Sin notificación al marcar AUSENTE automáticamente~~ | — | ✅ Resuelto — notificación agregada en `marcarAusente()` y `scheduler.ts` |
| 2 | ~~`asignarReemplazo` incompleto~~ | — | ✅ Resuelto — funcionalidad eliminada |
| 3 | ~~Estado REPROGRAMADA nunca usado~~ | — | ✅ Resuelto — eliminado del modelo y del pipe |
| 4 | **Inconsistencia cancelación PENDIENTE**: cliente vs Cloud Function | Comportamiento distinto según quién corra el proceso | Pendiente — definir antes de activar Blaze (ver `CLOUD_FUNCTIONS_PRODUCCION.md`) |
| 5 | **Crédito individual: UI solo muestra 40 min** | El modelo soporta otras duraciones pero no hay forma de agendarlas | Pendiente — decisión de negocio |
| 6 | **Sin flujo de re-agendar cuando instructor rechaza con horario sugerido** | Alumno recibe notificación con hora sugerida pero debe buscarla manualmente | Pendiente — mejora de UX futura |
| 7 | **Sin renovación automática de plan** | Al vencer, el alumno queda sin saldo hasta que el admin actúe | Aceptado — renovación manual por ahora |
| 8 | **Proceso automático solo corre al login del admin** | Clases del día pueden quedar en CONFIRMADA si el admin no se loguea | Resuelto al activar Blaze (ver `CLOUD_FUNCTIONS_PRODUCCION.md`) |
| 9 | **`eliminar` en usuario.service borra solo Firestore** | La cuenta de Firebase Auth queda huérfana | Resuelto al activar Blaze — usar CF `eliminarUsuario` (ver `CLOUD_FUNCTIONS_PRODUCCION.md`) |
| 10 | **`procesarClasesVencidas` quedará duplicado con Blaze** | Doble procesamiento al hacer deploy | Resuelto al activar Blaze — eliminar llamada en `admin-layout` (ver `CLOUD_FUNCTIONS_PRODUCCION.md`) |
