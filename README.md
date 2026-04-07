# AutoEscuela IA

Sistema de gestión integral para academias de manejo con múltiples sucursales.

## Stack Tecnológico

- **Frontend:** Angular 21 (Standalone Components, Signals)
- **UI:** Angular Material
- **Backend:** Firebase (Auth, Firestore, Cloud Functions, Storage, FCM)
- **State:** Angular Signals + `toSignal`
- **QR:** html5-qrcode + qrcode
- **Exportación:** xlsx + jsPDF

## Requisitos previos

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Angular CLI: `npm install -g @angular/cli`

## Instalación

```bash
# 1. Clonar e instalar dependencias del frontend
npm install

# 2. Instalar dependencias de Cloud Functions
cd functions && npm install && cd ..

# 3. Login y asociar proyecto Firebase
firebase login
firebase use --add
```

## Configurar credenciales

Editá `src/environments/environment.ts` con los datos de tu proyecto Firebase:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU_PROJECT.firebaseapp.com',
    projectId: 'TU_PROJECT_ID',
    storageBucket: 'TU_PROJECT.appspot.com',
    messagingSenderId: 'TU_SENDER_ID',
    appId: 'TU_APP_ID',
  },
};
```

## Desarrollo local con emuladores

```bash
# Terminal 1: Iniciar emuladores Firebase
firebase emulators:start

# Terminal 2: Iniciar Angular
ng serve

# UI de emuladores: http://localhost:4000
```

## Estructura del proyecto

```
src/
├── app/
│   ├── core/
│   │   ├── guards/          # auth, role, guest guards
│   │   ├── interceptors/    # error interceptor HTTP
│   │   └── services/        # auth, turno, usuario, feedback, qr, notificacion...
│   ├── features/
│   │   ├── auth/            # login, register
│   │   ├── alumno/          # dashboard, calendario, mis-turnos, mi-saldo, historial, feedback
│   │   ├── instructor/      # dashboard, mis-clases, marcar-asistencia, evaluar-alumno, disponibilidad
│   │   └── admin/           # dashboard, alumnos, instructores, turnos, reportes, sucursales...
│   └── shared/
│       ├── models/          # interfaces TypeScript
│       ├── pipes/           # estadoTurno, fechaHora, moneda
│       └── utils/           # date-utils, slot-utils, validators
functions/
├── src/
│   ├── turnos.ts            # onTurnoEstadoCambio, validarDisponibilidadSlots
│   ├── alumnos.ts           # recalcularValoracion, comprarPaquete
│   ├── notificaciones.ts    # recordatorios, emails
│   └── scheduler.ts         # bloqueo inactivos, ausentes automáticos
firestore.rules              # Security Rules por rol y sucursal
firestore.indexes.json       # Índices compuestos
```

## Roles del sistema

| Rol | Ruta | Color sidebar |
|-----|------|---------------|
| `alumno` | `/alumno/*` | Azul índigo |
| `instructor` | `/instructor/*` | Verde |
| `admin` | `/admin/*` | Gris azulado |
| `super-admin` | `/admin/*` + sucursales | Gris azulado |

## Primer usuario admin

1. Creá el usuario desde Firebase Console → Authentication
2. En Firestore, editá `users/{uid}` y cambiá `rol` a `"super-admin"` y completá `sucursalId`

## Deploy

```bash
# Build de producción
ng build --configuration=production

# Deploy completo
firebase deploy

# Solo frontend
firebase deploy --only hosting

# Solo functions
firebase deploy --only functions
```

## Servicios Firebase usados

| Servicio | Uso |
|----------|-----|
| Authentication | Login, roles, sesión |
| Firestore | Base de datos en tiempo real |
| Cloud Functions | Lógica de negocio (slots, consumo, bloqueos) |
| Cloud Scheduler | Recordatorios, bloqueos automáticos |
| Storage | Fotos de perfil |
| FCM Messaging | Push notifications |
| Trigger Email Ext. | Emails transaccionales vía SendGrid |
