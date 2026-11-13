# Validación de la migración nativa

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
