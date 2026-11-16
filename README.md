# Financia

Aplicación de finanzas personales con **React Native CLI + TypeScript**, sin Expo ni EAS. API opcional en **C# / ASP.NET Core 10**.

## Desarrollo móvil

Requisitos: Node compatible con React Native 0.86 (por ejemplo Node 22.13 o posterior de la rama 22), JDK 17 y Android Studio con el SDK/NDK indicados en `android/build.gradle`. Configura `JAVA_HOME` y `ANDROID_HOME`. Para iOS necesitas macOS, Xcode, Ruby y CocoaPods.

```sh
npm install
npm start
```

En otra terminal:

```sh
npm run android
# En macOS, primero: bundle install y cd ios && bundle exec pod install
npm run ios
```

La app se instala directamente en el dispositivo o emulador. Conserva el identificador `com.kal.financia` y el retorno OAuth `financia://auth/callback`.

La firma release se configura con `FINANCIA_RELEASE_STORE_FILE`, `FINANCIA_RELEASE_STORE_PASSWORD`, `FINANCIA_RELEASE_KEY_ALIAS` y `FINANCIA_RELEASE_KEY_PASSWORD` en el entorno de Gradle. Sin ellas, release queda sin firmar; nunca usa automáticamente la clave debug.

Para generar un APK de desarrollo, entra en `android` y ejecuta `./gradlew assembleDebug` (Windows: `./gradlew.bat assembleDebug`). Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`. La variante debug usa Metro. Los artefactos de distribución requieren configurar tu firma de producción; no se incluye ninguna clave privada.

Guía oficial: https://reactnative.dev/docs/0.86/getting-started-without-a-framework

## Web

`npm run web` abre el servidor local en http://127.0.0.1:8080. `npm run build:web` genera `dist/` mediante webpack. Se conserva React Native Web y el formulario web. PDF utiliza la impresión del navegador; móvil utiliza un generador PDF nativo y el diálogo de compartir.

## Configuración pública

Copia `.env.example` a `.env` y completa únicamente las claves públicas:

```env
FINANCIA_SUPABASE_URL=https://TU-PROYECTO.supabase.co
FINANCIA_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
FINANCIA_API_URL=
```

El compilador incorpora exclusivamente estas tres variables. Nunca pongas claves de servicio, contraseñas o secretos OAuth en ellas. Reinicia Metro/webpack cuando cambies `.env`; si reutiliza caché, ejecuta `npm start -- --reset-cache`.

La variable `FINANCIA_SUPABASE_ANON_KEY` acepta una clave pública `sb_publishable_...` o la clave legacy con rol `anon`. El build rechaza claves privilegiadas y tokens de usuario. Es una protección contra errores de configuración; la clave pública sigue siendo visible en los clientes compilados.

Google/Apple siguen usando el proveedor de identidad existente. Permite `financia://auth/callback` y el origen web en sus URLs de retorno. Los archivos nativos registran el esquema. La integración Gmail existente se documenta en [backend/GMAIL_EXISTING.md](backend/GMAIL_EXISTING.md).

## Backend C#

Para ejecutar **web + API + PostgreSQL con Docker Desktop**: detén el webpack anterior y ejecuta `npm run docker:up`. Abre http://127.0.0.1:8080. `npm run docker:verify` comprueba el entorno y `npm run docker:stop` lo detiene conservando el volumen. La base Docker es nueva y no copia automáticamente SQLite. Consulta [desarrollo con Docker](backend/DOCKER.md).

```sh
npm run api:start
npm run api:test
npm run api:build
```

Para probar la conexión local en dos terminales: `npm run api:connected` y `npm run web:connected`. El segundo puede sustituirse por `npm run android:connected`. Usan la identidad pública de `.env` y una base de desarrollo aislada, sin cambiar tu configuración guardada.

Consulta [backend/README.md](backend/README.md) para configurar autenticación, PostgreSQL y la conexión desde el teléfono. SQLite sirve para el desarrollo local. La API no está desplegada.

La [API v2](backend/V2.md) incluye tablas normalizadas, importación, movimientos, bolsillos, recibos y notificaciones SignalR. La app actual ya está integrada: consulta [cómo activar la conexión](backend/CLIENT_CONNECTION.md). El servidor requiere activar v2 explícitamente. El [plan de migración](docs/architecture/migration-plan.md) describe los siguientes pasos para separar web y móvil.

El [cliente compartido `@financia/api-client`](packages/api-client/README.md) es un npm workspace utilizado por la conexión de la app. `npm run api:generate` genera el contrato y los tipos desde C#; `npm run api:check` detecta diferencias. La futura web independiente usará el mismo paquete.

Con `FINANCIA_API_URL` vacío se mantiene el almacenamiento local. Al configurarlo, las cuentas autenticadas usan v2 y requieren conexión; el invitado sigue siendo local. La primera activación muestra qué historial propio se usará y requiere confirmación. El original local se conserva separado. Las operaciones con resultado incierto guardan su clave para recuperarse sin duplicados.

## Datos existentes

Se conservan las claves de AsyncStorage y la separación entre cuentas e invitado. Cambiar de una instalación de Expo Go a una app nativa cambia el contenedor de datos: esos datos no se transfieren automáticamente. Tampoco se puede actualizar un APK anterior con una firma diferente. No desinstales la app anterior sin respaldar su historial. No se ha accedido a datos financieros reales durante la migración.

## Estructura

- `index.js` / `index.web.js`: entradas nativa y web.
- `App.tsx`: navegación React Navigation existente.
- `android/`, `ios/`: proyectos nativos propios.
- `screens/`, `components/`, `store/`, `types/`, `utils/`: aplicación existente.
- `backend/`: API C# y pruebas de integración.

## Verificación

`npm run typecheck`, `npm test`, `npm run api:test`, `npm run build:web`.

Para verificar el bundle Android sin generar APK:

```sh
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output artifacts/android/index.android.bundle --assets-dest artifacts/android --max-workers 2
```

Las pruebas con datos ficticios y el empaquetado no sustituyen la validación en teléfono. Consulta [ANDROID_VALIDATION.md](ANDROID_VALIDATION.md).
