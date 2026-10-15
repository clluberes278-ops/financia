# Financia — Guía de desarrollo

Financia es una aplicación de finanzas personales construida con Expo, React Native y TypeScript. Los datos se guardan localmente; no hay backend.

## Comandos

- Desarrollo: `npm start`
- Android: `npm run android`
- iOS: `npm run ios`
- Web: `npm run web`
- Dependencias: `npm install`
- Preview EAS: `eas build --platform android --profile preview` o `eas build --platform ios --profile preview`
- Verificación TypeScript: `npx tsc --noEmit`

## Estructura actual

- `App.tsx`: punto de entrada actual y navegación activa con React Navigation.
- `app/`: wrappers de rutas presentes en el repositorio; no están conectados al punto de entrada actual.
- `screens/`: pantallas completas agrupadas por función.
- `components/`: componentes visuales reutilizables.
- `store/`: estado global con Zustand y persistencia local en AsyncStorage.
- `types/`: modelos de dominio y tipos compartidos, incluidas las rutas.
- `utils/`: temas, traducciones, cálculos y exportación.

No mover el proyecto a `src/` ni cambiar el enrutador como parte de cambios de UI o tipado; las pantallas existentes ya están organizadas en los directorios anteriores.

## Reglas de implementación

- Mantener TypeScript estricto. No usar `any`; definir tipos de props y modelos en `types/` o junto al componente cuando sean privados.
- Tipar las rutas y parámetros de navegación usando los tipos compartidos de `types/navigation.ts`.
- Mantener componentes enfocados y reutilizar componentes, hooks y funciones existentes antes de duplicar lógica.
- Manejar los errores de operaciones asíncronas con retroalimentación visible para el usuario. No silenciar fallos.
- Usar `StyleSheet.create` y `FlatList` con `keyExtractor` para colecciones largas. Considerar áreas seguras y teclado al construir pantallas y formularios.
- Validar los cambios con `npx tsc --noEmit` y las pruebas pertinentes disponibles.

## Identidad visual

- Interfaz fintech moderna, clara y accesible; tarjetas de esquinas redondeadas, bordes sutiles y jerarquía tipográfica marcada.
- Centralizar colores compartidos y variantes claro/oscuro en `utils/theme.ts`; obtener el tema actual desde `useSettingsStore`.
- Respetar el color de acento configurable del usuario. Usar los colores semánticos del tema para ingresos, gastos y avisos.
- Evitar colores de superficie o texto fijos en componentes que deban adaptarse al modo oscuro.
