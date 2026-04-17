import { ApplicationConfig, provideBrowserGlobalErrorListeners, LOCALE_ID } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { getMessaging, provideMessaging } from '@angular/fire/messaging';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es-AR';
import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { errorInterceptor } from './core/interceptors/error.interceptor';

registerLocaleData(localeEs, 'es-AR');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([errorInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-AR' },

    // Firebase
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideMessaging(() => getMessaging()),
    provideFunctions(() => getFunctions(undefined, 'southamerica-east1')),
  ],
};
