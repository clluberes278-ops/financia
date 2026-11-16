# Financia móvil

Workspace `@financia/mobile`: React Native CLI + TypeScript y React Navigation, sin Expo. Conserva las pantallas existentes, el identificador Android `com.kal.financia` y el retorno OAuth `financia://auth/callback`.

Desde la raíz instala con `npm install`. El lockfile y `node_modules` se comparten entre workspaces; no hay que instalar una segunda copia dentro del móvil.

```powershell
npm start
npm run android
npm run mobile:config
npm run mobile:bundle:android
```

`start` y `android` se usan en terminales separadas. Los scripts equivalentes también se pueden ejecutar con `npm run <script> --workspace @financia/mobile`.

## APK para instalar sin Expo Go ni Metro

Con Docker Desktop iniciado:

```powershell
npm run mobile:apk:docker
```

El comando usa herramientas oficiales de Google, JDK 17 y Node dentro de Docker. La primera compilación descarga el SDK/NDK y sus dependencias y puede tardar varios minutos. Produce `artifacts/android-preview/financia-preview.apk` y su SHA-256. La variante `preview` incluye JavaScript, usa la firma pública de desarrollo y permite HTTP para pruebas locales. No es una versión para publicar en tiendas.

El Docker de compilación se dirige a Linux amd64 y genera ARM64 por defecto. Para otras CPU configura `FINANCIA_ANDROID_ARCHITECTURES` antes de compilar (por ejemplo `arm64-v8a,x86_64`); los valores admitidos son `armeabi-v7a`, `arm64-v8a`, `x86` y `x86_64`. No instala ni prueba automáticamente el APK en un teléfono.

Con JDK 17 y Android SDK instalados en el equipo:

```powershell
npm run mobile:apk:debug    # Requiere Metro
npm run mobile:apk:preview  # JavaScript incluido; firma de desarrollo
npm run mobile:apk:release  # Exige firma de producción configurada
npm run mobile:aab:release  # Android App Bundle para distribución
```

Los archivos locales quedan en `apps/mobile/android/app/build/outputs/`. Para producción configura `FINANCIA_RELEASE_STORE_FILE` (ruta absoluta), `FINANCIA_RELEASE_STORE_PASSWORD`, `FINANCIA_RELEASE_KEY_ALIAS` y `FINANCIA_RELEASE_KEY_PASSWORD`. No versionar claves de producción ni contraseñas. Los comandos release no sustituyen esas claves por la firma debug.

## Configuración y conexión

La configuración pública sigue en `.env` de la raíz. El plugin Babel usa una ruta absoluta al plugin compartido y solo incorpora URL de identidad, clave pública permitida y URL de API. Cambiar la ubicación de la app no cambia las claves de almacenamiento local ni migra datos entre aplicaciones con firmas distintas.

`FINANCIA_API_URL` vacía conserva el modo local. Para compartir datos autenticados, usa la misma identidad y API que la web. En el emulador Android, Docker se alcanza con `http://10.0.2.2:5081`; un teléfono físico necesita una API HTTPS accesible. `127.0.0.1` en el teléfono se refiere al propio teléfono. El APK preview no convierte la API local del equipo en un servidor público.

El atajo `npm run android:connected` conserva el backend SQLite de desarrollo en 5080. Para probar Docker, configura la URL correspondiente y ejecuta `npm run android`, o compila preview con esa configuración. Ver [conexión](../../backend/CLIENT_CONNECTION.md) y [Docker](../../backend/DOCKER.md).

## iOS

Los proyectos iOS se conservan, pero Xcode y CocoaPods requieren macOS. En un Mac:

```sh
cd apps/mobile
bundle install
cd ios
bundle exec pod install
cd ../../..
npm run ios
```

No se valida una compilación Xcode desde Windows. La firma y distribución iOS siguen sus requisitos propios.
