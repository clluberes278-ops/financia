# Financia — Guía de desarrollo

Financia es una aplicación de finanzas personales construida con React Native CLI y TypeScript, sin Expo. El almacenamiento local se conserva; la API opcional ASP.NET Core 10 está en backend/. Consulta backend/README.md antes de modificar persistencia remota.

## Comandos

- Desarrollo: `npm start`
- Android: `npm run android`
- iOS: `npm run ios`
- Web: `npm run web`
- Dependencias: `npm install`
- Backend: `npm run api:start`
- Pruebas backend: `npm run api:test`
- APK debug: `npm run mobile:apk:debug`
- APK preview sin Metro: `npm run mobile:apk:preview` (JDK/SDK local) o `npm run mobile:apk:docker`
- Verificación TypeScript: `npx tsc --noEmit`

## Estructura actual

- `apps/mobile/`: workspace React Native CLI; sus dependencias se instalan desde la raíz con npm workspaces.
- `apps/mobile/App.tsx`: punto de entrada actual y navegación activa con React Navigation.
- `apps/mobile/screens/`: pantallas completas agrupadas por función.
- `apps/mobile/components/`: componentes visuales reutilizables.
- `apps/mobile/store/`: estado global con Zustand y persistencia local en AsyncStorage.
- `apps/mobile/types/`: modelos de dominio y tipos compartidos, incluidas las rutas.
- `apps/mobile/utils/`: temas, traducciones, cálculos y exportación.
- `packages/api-client/`: cliente HTTP y tipos generados, compartidos con la futura web independiente.

No mover el móvil a `src/` ni cambiar su enrutador como parte de cambios de UI o tipado; las pantallas existentes ya están organizadas en los directorios anteriores. La web actual comparte `apps/mobile/App.tsx` mediante React Native Web; `apps/web` con React DOM, TypeScript y Vite es un objetivo pendiente.

## Reglas de implementación

- Mantener TypeScript estricto. No usar `any`; definir tipos de props y modelos en `types/` o junto al componente cuando sean privados.
- En móvil, tipar las rutas y parámetros de navegación usando los tipos compartidos de `apps/mobile/types/navigation.ts`.
- Mantener componentes enfocados y reutilizar componentes, hooks y funciones existentes antes de duplicar lógica.
- Manejar los errores de operaciones asíncronas con retroalimentación visible para el usuario. No silenciar fallos.
- En móvil, usar `StyleSheet.create` y `FlatList` con `keyExtractor` para colecciones largas. Considerar áreas seguras y teclado al construir pantallas y formularios.
- Validar los cambios con `npx tsc --noEmit` y las pruebas pertinentes disponibles.

## Desarrollo web

- Antes de trabajar en HTML, CSS o JavaScript del navegador, consultar [Modern Web Guidance](.agents/skills/modern-web-guidance/SKILL.md), instalada desde la [fuente oficial de Google Chrome](https://github.com/GoogleChrome/modern-web-guidance).
- Buscar y recuperar únicamente la orientación pertinente con el flujo de búsqueda/consulta de la skill; revisar su cumplimiento al terminar cada cambio web.
- Priorizar HTML semántico, accesibilidad, rendimiento y capacidades nativas del navegador. Usar Baseline Widely available por defecto; para APIs más recientes, detectar capacidades y proporcionar alternativas compatibles.
- Mantener TypeScript estricto y la prohibición de `any`, incluso si un ejemplo de la guía lo utiliza. Las reglas de React Navigation, `StyleSheet` y `FlatList` corresponden al móvil; la futura web independiente tendrá HTML/CSS y navegación propios.
- Esta adopción no implementa `apps/web` ni cambia el backend C#. La integración Gmail conserva la última prioridad del plan de migración.

## Identidad visual

- Interfaz fintech moderna, clara y accesible; tarjetas de esquinas redondeadas, bordes sutiles y jerarquía tipográfica marcada.
- Centralizar colores compartidos y variantes claro/oscuro en `apps/mobile/utils/theme.ts`; obtener el tema actual desde `useSettingsStore`.
- Respetar el color de acento configurable del usuario. Usar los colores semánticos del tema para ingresos, gastos y avisos.
- Evitar colores de superficie o texto fijos en componentes que deban adaptarse al modo oscuro.
