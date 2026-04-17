import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { App } from './app';

// El componente raíz solo renderiza <router-outlet />.
// TestBed requiere initTestEnvironment (setup file) que no está configurado en este proyecto.
// Verificamos la clase directamente.
describe('App', () => {
  it('la clase App existe y es un constructor', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });

  it('el selector del componente es app-root', () => {
    // Accede a los metadatos de Angular sin instanciar el componente
    const annotations = (App as any).__annotations__;
    if (annotations?.length) {
      expect(annotations[0].selector).toBe('app-root');
    } else {
      // Con compilación AOT los metadatos están en ɵcmp
      const cmp = (App as any).ɵcmp;
      expect(cmp?.selectors?.[0]?.[0]).toBe('app-root');
    }
  });
});
