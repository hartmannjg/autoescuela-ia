# Cloud Functions — Checklist pre-producción

> Documento generado: 2026-04-26
> Estado actual: todas las Cloud Functions están **escritas y listas** en `functions/src/`.
> Bloqueante: requieren **plan Blaze (pay-as-you-go)** en Firebase para hacer deploy.
> Al activar Blaze, ejecutar los pasos de este documento en orden.

---

## 1. Qué ya está implementado y listo para deploy

Las siguientes funciones ya existen en el código y solo necesitan `firebase deploy --only functions`:

| Función | Archivo | Tipo | Schedule |
|---|---|---|---|
| `completarClasesVencidas` | `scheduler.ts:75` | Scheduled | Cada hora |
| `cancelarPendientesSinRespuesta` | `scheduler.ts:178` | Scheduled | Diaria 7:00 AM |
| `bloquearAlumnosInactivos` | `scheduler.ts:11` | Scheduled | Lunes 8:00 AM |
| `penalizarInactividadSemanal` | `scheduler.ts:214` | Scheduled | Lunes 9:00 AM |
| `enviarRecordatorios24hs` | `notificaciones.ts` | Scheduled | Diaria 9:00 AM |
| `onTurnoEstadoCambio` | `turnos.ts` | Firestore trigger | Al cambiar estado |
| `onNotificacionCreada` | `notificaciones.ts` | Firestore trigger | Al crear notificación |
| `recalcularValoracionInstructor` | `alumnos.ts` | Firestore trigger | Al crear feedback |
| `comprarPaquete` | `alumnos.ts` | Callable | — |
| `eliminarUsuario` | `alumnos.ts` | Callable | — |

---

## 2. Cambios a hacer en el cliente al hacer deploy

### 2.1 Remover `procesarClasesVencidas` del admin-layout — CRÍTICO

**Problema:** `admin-layout.component.ts:50` llama `procesarClasesVencidas()` al hacer login.
Una vez que `completarClasesVencidas` esté deployada (corre cada hora automáticamente),
esta llamada client-side es redundante y puede generar ejecuciones dobles.

**Acción:** Eliminar el bloque en `admin-layout.component.ts`:
```typescript
// ELIMINAR estas líneas:
this.turnoService.procesarClasesVencidas(id).catch(...)
```
También eliminar (o marcar como `@deprecated`) el método `procesarClasesVencidas()` de `turno.service.ts`
y los métodos privados `completarClase()`, `marcarAusente()`, `vencio()`, `inicioYaPaso()`
que solo son usados por él.

---

### 2.2 Inconsistencia en cancelación de PENDIENTE_CONFIRMACION

**Problema:** La lógica difiere entre cliente y servidor:
- **Cliente** (`turno.service.ts:587`): cancela si `inicioYaPaso()` (la hora de inicio ya pasó)
- **Cloud Function** (`scheduler.ts:178`): cancela si `creadoEn < hace 24 horas`

Con el deploy, solo quedará activa la de Cloud Functions (24hs desde creación).
Verificar con el negocio cuál es la regla correcta antes de lanzar.

**Acción sugerida:** Alinear la Cloud Function para usar la hora de inicio del turno como criterio
(más predecible para el alumno: "si el instructor no confirma antes del inicio, se cancela").

---

### 2.3 Notificaciones client-side — duplicadas con triggers

**Problema:** `turno.service.ts` llama `notificacionService.enviar()` manualmente en varios puntos
(al crear turno, cancelar, rechazar, etc.). Al mismo tiempo, `onTurnoEstadoCambio` en Cloud Functions
ya envía notificaciones al detectar cambios de estado.

Esto puede generar **notificaciones duplicadas**.

**Acción:** Al deployar, revisar qué notificaciones dispara el trigger de Cloud Functions y
eliminar las llamadas manuales en el cliente que queden duplicadas. Hacer prueba funcional
completa del flujo de notificaciones.

---

## 3. Mejoras de seguridad en Firestore Rules

Cambios a aplicar en `firestore.rules` antes de producción:

### 3.1 Notificaciones — solo Cloud Functions pueden crear

```javascript
// ESTADO ACTUAL (permisivo — cualquier usuario logueado puede crear):
allow create: if isLoggedIn();

// CAMBIAR A (solo el admin SDK de Cloud Functions puede crear):
allow create: if false;
```

> Justificación: un usuario malicioso podría spam-notificar a otros usuarios.
> Las notificaciones siempre deben originarse desde el servidor.

---

### 3.2 `saldoDescontado` debe ser inmutable una vez en `true`

```javascript
// AGREGAR en la regla de /turnos/{turnoId}:
allow update: if !(resource.data.saldoDescontado == true
                   && request.resource.data.saldoDescontado == false);
```

> Justificación: actualmente el cliente podría cambiar `saldoDescontado` de `true` a `false`
> y volver a recibir el descuento. Esta regla lo bloquea a nivel base de datos.

---

### 3.3 `alumnoData` no debe ser modificable por el propio alumno

```javascript
// VERIFICAR que la regla de /users/{userId} incluya:
allow update: if request.auth.uid == userId
  && !request.resource.data.diff(resource.data).affectedKeys()
     .hasAny(['rol', 'sucursalId', 'alumnoData.bloqueado',
              'alumnoData.planContratado', 'alumnoData.creditoIndividual']);
```

> Verificar que las reglas actuales ya cubren esto; si no, agregar.

---

## 4. Nuevas Cloud Functions a implementar (no existen aún)

### 4.1 `crearTurno` — Callable function (ALTA PRIORIDAD)

**Problema actual:** la creación de un turno ocurre completamente en el cliente.
El cliente valida disponibilidad de slots con `getDocs` y luego crea el turno en una
transacción separada — ventana de race condition entre la verificación y la escritura.
Si dos alumnos intentan reservar el mismo slot simultáneamente, ambas verificaciones
pueden pasar antes de que cualquiera escriba.

**Solución:** mover toda la lógica de `turno.service.ts:crearTurno()` a una
Callable Cloud Function donde la validación y escritura ocurran en la **misma transacción**.

```typescript
// functions/src/turnos.ts — agregar:
export const crearTurnoCallable = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    // 1. Verificar auth
    // 2. Dentro de una transaction:
    //    a. Verificar slots disponibles
    //    b. Verificar saldo del alumno
    //    c. Verificar fecha de vencimiento del plan (con server time)
    //    d. Verificar límite de reagendas (con server time)
    //    e. Crear el turno
    //    f. Descontar saldo (o reservarlo)
    //    g. Enviar notificación al instructor
  });
```

---

### 4.2 `cancelarTurnoCallable` — Callable function (MEDIA PRIORIDAD)

**Problema actual:** la cancelación y devolución de saldo ocurre client-side.
Aunque las Firestore Rules restringen quién puede cancelar, la lógica de devolución
depende de que el cliente la ejecute correctamente.

**Solución:** mover `turno.service.ts:cancelarTurno()` a Cloud Function callable,
garantizando devolución atómica y auditoría server-side.

---

### 4.3 `verificarAlertasFlotaDiaria` — Scheduled function (MEDIA PRIORIDAD)

**Problema actual:** `admin-layout.component.ts:verificarAlertasFlota()` corre client-side en cada login,
con deduplicación por `localStorage` (clave `flota_check_${sucursalId}`, valor = fecha del día).
Solo se ejecuta si un admin abre el panel; si nadie entra, no se generan notificaciones.

**Solución:** reemplazar con una Cloud Function scheduled que corra a las 8:00 AM diariamente.

```typescript
// functions/src/scheduler.ts — agregar:
export const verificarAlertasFlotaDiaria = functions
  .region('southamerica-east1')
  .pubsub.schedule('every day 08:00')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    // 1. Para cada sucursal: obtener todos los autos activos + sus mantenimientos
    // 2. Para cada auto, replicar calcularAlertas() (misma lógica que auto.service.ts)
    // 3. Por cada alerta vencida/próxima: crear notificación al admin de la sucursal
    // 4. VTV y seguro: alertar si vencen en <= 30 días
    // 5. Evitar duplicados: verificar si ya existe notificación del día (mismo autoId + tipo)
  });
```

**Al hacer deploy:**
- Eliminar el método `verificarAlertasFlota()` de `admin-layout.component.ts`
- Eliminar `getAutosOnce()` y `getMantenimientosPorSucursalOnce()` de `auto.service.ts` si no tienen otro uso
- Eliminar el `localStorage.setItem/getItem` asociado a `flota_check_${sucursalId}`

---

### 4.4 `auditLog` — Firestore trigger (BAJA PRIORIDAD)

Para operaciones administrativas sensibles (asignar plan, dar créditos, bloquear alumno),
agregar una Cloud Function que registre cada cambio en una colección `auditLog`:

```typescript
export const onUserModified = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after  = change.after.data();
    // Registrar qué campos cambiaron, quién los cambió, cuándo
  });
```

---

## 5. Inconsistencia de umbrales a decidir antes de producción

| Parámetro | Cliente | Cloud Function | Decisión pendiente |
|---|---|---|---|
| Ventana de validación post-clase | `horaFin + 60min` | `horaFin + 60min` | ✅ Consistente |
| Cancelación PENDIENTE sin respuesta | Al pasar `horaInicio` | 24hs desde creación | ❓ Definir con el negocio |
| Semanas inactividad para bloqueo | No aplica | Configurable en `configuracion/global` | ✅ OK |

---

## 6. Checklist de deploy

Al activar el plan Blaze, ejecutar en este orden:

- [ ] `firebase deploy --only functions` — deployar todas las funciones
- [ ] Verificar en Firebase Console que los schedules aparecen activos
- [ ] Ejecutar prueba de `completarClasesVencidas` manualmente desde Console
- [ ] Remover llamada a `procesarClasesVencidas` en `admin-layout.component.ts`
- [ ] Probar flujo completo de notificaciones (reserva → confirmación → recordatorio → completada)
  y verificar que no haya duplicados
- [ ] Actualizar `firestore.rules` con los cambios de la sección 3
- [ ] Decidir e implementar criterio de cancelación de PENDIENTE (sección 2.2)
- [ ] `firebase deploy --only firestore:rules`
- [ ] Monitorear Firebase Console → Functions → Logs durante las primeras 24hs
