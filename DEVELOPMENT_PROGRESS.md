# Financia Development Progress & Next Steps

## Corrección del inicio web — 15 de noviembre de 2026

- El error `Cannot read properties of undefined (reading 'Easing')` se reprodujo ejecutando el bundle completo. La compilación por sí sola no lo detectaba.
- El proveedor y el formulario de bottom sheet se resuelven ahora por plataforma. Android/iOS conservan `@gorhom/bottom-sheet`; la web utiliza su `TransactionModal` existente sin cargar el panel nativo.
- La prueba de bundle incluye ahora la importación de `App`, su renderizado inicial y una comprobación de que la web no incluye módulos del bottom sheet nativo. No usa cuentas reales ni la configuración de identidad del desarrollador.
- Validación: ambas pruebas de bundle (desarrollo y producción), TypeScript estricto y bundle JavaScript Android pasaron. La inspección visual automática se detuvo al no poder identificar con confianza la URL del navegador; no se verificó visualmente la sesión del usuario.
- Esta corrección no activa ni modifica cuentas, Gmail o bases remotas. El plan de conexión vigente está en `backend/CLIENT_CONNECTION.md` y `docs/architecture/migration-plan.md`.

## Próximos cambios acordados — 30 de octubre de 2026

**Estado:** trabajo aplazado a petición del usuario. Solo se documentan los próximos pasos; no se implementó la lectura de notificaciones ni se cambió la configuración del servidor durante este diagnóstico.

### Objetivo principal: registro automático desde notificaciones de Android
El usuario quiere que, al llegar un aviso del banco por Gmail, Financia detecte el monto y registre el movimiento automáticamente, sin tener que abrir la aplicación, pulsar sincronizar ni introducir gastos a mano. La propuesta de importación manual no responde a ese objetivo.

- [ ] Confirmar en el Android del usuario si las notificaciones de Gmail muestran monto, moneda y suficiente contexto del movimiento. Esta pregunta quedó pendiente.
- [ ] Evaluar e implementar una integración nativa Android con NotificationListenerService. No forma parte del APK actual y requerirá generar una nueva versión instalable.
- [ ] Solicitar al usuario acceso a notificaciones de forma explícita, explicar su alcance y permitir desactivar la función.
- [ ] Procesar localmente solo avisos bancarios reconocidos; no almacenar ni enviar el resto de las notificaciones ni credenciales.
- [ ] Extraer monto, moneda DOP/USD, tipo, fecha y comercio únicamente cuando el texto sea suficiente. No inventar datos ni convertir monedas. Marcar los avisos incompletos o ambiguos para revisión.
- [ ] Mantener una cola persistente para procesar avisos con la interfaz cerrada; probar reinicios, reconexión del servicio y restricciones del teléfono. No prometer captura de todos los avisos sin validación física.
- [ ] Asociar cada importación a un espacio financiero elegido explícitamente y conservar el aislamiento entre cuentas e invitado.
- [ ] Evitar duplicados por actualizaciones o agrupaciones de notificaciones y por coincidencia con importaciones del servidor. Definir qué fuente se usa antes de activar ambas a la vez.
- [ ] Aclarar que este método depende del contenido que Android entregue y no recupera por sí solo el historial antiguo de correos.
- [ ] Validar con datos ficticios y después en el Android del usuario: aviso nuevo, ingreso/gasto, DOP/USD, repetición del aviso, app cerrada, reinicio y cambio de cuenta.

### Diagnóstico pendiente de la integración actual de Gmail
- El usuario instaló el APK Android y pudo iniciar sesión y conectar Gmail, pero no ve movimientos.
- La fecha mostrada como última consulta parece corresponder al valor inicial de noventa días atrás. La migración del repositorio utiliza ese valor por defecto; no demuestra una sincronización completada.
- El registro aportado muestra una solicitud POST a gmail-poll originada por pg_net y rechazada con HTTP 401. No contiene el cuerpo de la respuesta; la causa exacta no está confirmada.
- Según lo indicado por el usuario en el panel, Verify JWT with legacy secret está desactivado y GMAIL_CRON_SECRET existe en Custom secrets. No se copiaron ni modificaron sus valores.
- [ ] Revisar el cuerpo de la respuesta y el código realmente desplegado para identificar qué control de autorización rechaza la solicitud.
- [ ] Comprobar la tarea programada, el encabezado x-cron-secret y su correspondencia con la clave guardada en Vault y en los secretos de la función, sin exponer valores.
- [ ] No eliminar protecciones de autorización como solución al error.
- [ ] Mejorar el estado visible: distinguir conexión autorizada, primera importación pendiente, sincronización completada y error. No presentar la fecha inicial como una consulta real.
- [ ] Si se conserva Gmail en el servidor, comprobar una importación real antes de considerarla operativa. No hace falta otro APK para corregir exclusivamente la autorización del servidor.

### Estado verificado de la aplicación
- Se implementaron espacios financieros separados por cuenta e invitado, monedas DOP/USD independientes, guardado conjunto de bolsillos y movimientos, correcciones de informes y exportación CSV móvil.
- El historial anterior se conserva sin propietario supuesto; su incorporación requiere confirmar propietario y monedas. Ajustes permite guardar una copia JSON íntegra.
- TypeScript y once pruebas con datos ficticios pasaron. Se generó un APK Android en el cupo gratuito de Expo y se verificó su descarga; no se publicó en tiendas.
- Los detalles de la compilación y las pruebas están en ANDROID_VALIDATION.md. La importación real de Gmail continúa pendiente de resolver.
- La navegación activa sigue en App.tsx con React Navigation. Mantener App.tsx y screens/ y respetar AGENTS.md; no migrar a Expo Router como parte de estos cambios.

---

## Historial anterior de planificación

**Nota:** el contenido histórico siguiente no refleja la arquitectura actual y no constituye el plan vigente. En particular, las propuestas de eliminar App.tsx/screens o migrar a Expo Router quedan sustituidas por las instrucciones actuales de AGENTS.md y por los próximos pasos anteriores.


## Current State
The project has completed the **Visual Overhaul (Sleek Dark Mode)** and is in the middle of the **Architectural Alignment**.

### ✅ Completed
- **Visual Overhaul:** Dashboard, Transactions, Savings, and Settings screens redesigned with a professional Dark Mode and dynamic theme system.
- **Core Features:** Biometric Lock and CSV Export implemented and integrated.
- **Infrastructure Migration:** 
    - Migrated from React Navigation to **Expo Router** (structure `/app` created).
    - Root Layout implemented with Providers and Biometric security.
    - Tab Navigation configured with a professional design system.
    - Screens mapped to file-based routes.
- **Initial Type Cleanup:** Centralized component interfaces in `types/app.ts` and fixed critical `any` in biometric error handling.

## 🚩 Pending Implementation (Next Session)

### 1. Finalize Navigation Refactor
- [ ] Replace `useNavigation<any>()` with `router` from `expo-router` in all screens.
- [ ] Update `navigation.navigate('...')` calls to `router.push('/...')`.

### 2. Complete Type Purge
- [ ] Eliminate all remaining `any` in components and stores.
- [ ] Refine `TransactionBottomSheet` props typing.
- [ ] Validate codebase with `tsc` to ensure 100% type safety.

### 3. Performance Audit
- [ ] Verify `useMemo` and `useCallback` implementation in transaction lists to prevent lag.
- [ ] Optimize render cycles in the Dashboard.

### 4. Final Cleanup
- [ ] Remove legacy `App.tsx` and `screens/` folder once the router is fully verified.
- [ ] Final end-to-end test of all flows (Biometry $\rightarrow$ Transactions $\rightarrow$ Savings $\rightarrow$ Reports $\rightarrow$ CSV Export).
