# Validación de la migración nativa

## APK del workspace — 16 de noviembre de 2026

- `npm run mobile:apk:docker` completó `assemblePreview` con 625 tareas. Se usaron Node, JDK 17, SDK/NDK oficiales y React Native CLI, sin Expo.
- Se corrigió la resolución de `hermes-compiler` desde el `node_modules` raíz para el monorepo; Windows selecciona `.exe` y RNGP sustituye `%OS-BIN%` según el host.
- Archivo: `artifacts/android-preview/financia-preview.apk`, ARM64, 40.134.860 bytes. Su firma debug pasó `apksigner verify`.
- El ZIP contiene `assets/index.android.bundle` (4.150.556 bytes de bytecode), `lib/arm64-v8a/libhermesvm.so` y las bibliotecas nativas. No necesita Metro para cargar ese bundle.
- El SHA-256 calculado en Windows coincide con el generado en Docker: `478ae84f2f5f050b914a844765f3ff96b712ea0a6b3e73457e482dedc930d165`.
- Pruebas del traslado: 71 JavaScript, 63 C#, TypeScript estricto, bundles web y Android y autolinking. La prueba de configuración nativa y TypeScript se repitieron tras el ajuste de Hermes.
- Sigue pendiente instalar y probar en un Android físico. El APK de esta validación usa almacenamiento local; compartir datos desde el teléfono requiere una URL de API accesible. No es un release firmado para tiendas. iOS se aplaza porque no hay Mac disponible.

## Workspace móvil — 15 de noviembre de 2026

La aplicación actual está en `apps/mobile`, con `com.kal.financia`, React Navigation y React Native CLI conservados. `npm run mobile:config` resuelve los proyectos Android/iOS y las dependencias nativas instaladas en la raíz. El bundle Android se genera con `npm run mobile:bundle:android`.

La variante `preview` incluye JavaScript y usa firma debug para instalarse sin Metro; no es una compilación para tiendas. Los comandos y requisitos están en [móvil](apps/mobile/README.md). La instalación física y la compilación Xcode en macOS requieren verificación específica.

El contenido siguiente corresponde a verificaciones históricas de la migración inicial; no sustituye el estado del workspace descrito arriba.

## Comprobado

- TypeScript estricto: correcto.
- 15 pruebas JavaScript: correctas; incluye persistencia, cuentas, monedas, exportaciones, adaptador nativo, repositorio remoto y precisión de saldos de bolsillos.
- 3 pruebas de integración C#: correctas; aislamiento HTTP, autenticación obligatoria, conflictos, validación de importes y campos opcionales compatibles con el cliente.
- Bundle Android de React Native CLI: generado en `artifacts/android/`. Es JavaScript y recursos, no un APK.
- Configuración CLI: reconoce `android/`, `ios/` y el paquete `com.kal.financia`.
- Árbol npm: sin Expo, expo-modules-core, expo-font ni @expo/vector-icons instalados.
- Desarrollo web: compilación correcta con webpack.
- Producción web e iOS: empaquetado correcto. Web advierte sobre el tamaño del bundle y de la fuente de iconos.
- API local: `/health` respondió 200 y `/api/finances` sin sesión respondió 401. El proceso de prueba quedó detenido.

## Pendiente en dispositivo

El equipo no tiene JDK ni Android SDK configurados. No se ha generado ni instalado un APK nativo nuevo. iOS necesita Xcode y CocoaPods en un Mac. La herramienta de navegador no estuvo disponible para la comprobación visual; compilar web no confirma su ejecución en un navegador.

1. Compilar e instalar la app en Android; comprobar iconos, degradados, áreas seguras, teclado y formularios.
2. Crear ingresos DOP 1000 y USD 100 como invitado; verificar persistencia al reiniciar.
3. Abonar, retirar y eliminar un bolsillo; verificar devolución del remanente.
4. Compartir CSV, PDF y respaldo JSON, incluidos cancelación, notas y tildes.
5. Comprobar Google/Apple y retorno `financia://auth/callback` en dispositivo.
6. Con API configurada, probar dos cuentas y dos dispositivos; provocar conflicto y fallo de conexión.
7. Verificar las importaciones Gmail reales y PostgreSQL antes del despliegue. Los tests usan SQLite temporal y autenticación ficticia.

La firma de desarrollo nueva no sustituye la firma del APK previo. No desinstalar la versión anterior sin respaldo: Expo Go tiene un contenedor separado. El historial local original no se sobrescribe al activar la API.

La auditoría npm todavía señala dependencias transitivas vulnerables, incluidas las de React Navigation 6; se corrigió `shell-quote` crítico, pero no se hizo una actualización mayor del enrutador durante esta migración. Revisar el informe antes de publicar.
