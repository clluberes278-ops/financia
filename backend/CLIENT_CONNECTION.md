# App conectada a la API v2

La app actual (React Native CLI y su vista web existente) ya usa `@financia/api-client` cuando `FINANCIA_API_URL` está configurada y el usuario ha iniciado sesión. No se ha desplegado una API, cambiado una base remota ni migrado cuentas reales durante este desarrollo. La web React DOM independiente sigue pendiente.

## Activar en desarrollo

También puedes ejecutar el entorno completo con `npm run docker:up`: web en 8080, API en **5081** y PostgreSQL persistente. Detén el webpack anterior para liberar 8080. Esta base no contiene el historial del atajo SQLite: consulta [Docker](DOCKER.md) antes de cambiar de entorno.

Atajo local con la URL y clave pública de Supabase ya configuradas en `.env`: en una terminal ejecuta `npm run api:connected` y en otra `npm run web:connected` (o `npm run android:connected`). No modifica `.env`: la API usa una base aislada en `artifacts/connected-dev.db` y el cliente recibe la dirección local correspondiente. La primera conexión sigue requiriendo confirmación en la app. Detén cualquier webpack/Metro anterior antes de usar estos comandos para no reutilizar un bundle con la configuración previa.

Para configurar manualmente un backend local distinto o un despliegue, sigue estos pasos:

1. En una terminal de la raíz, configura el backend con el mismo proyecto de identidad que la app y una base aislada:

   ```powershell
   $env:FinanceV2__Enabled = 'true'
   $env:Authentication__SupabaseUrl = 'https://TU-PROYECTO.supabase.co'
   $env:Authentication__PublishableKey = 'TU-CLAVE-PUBLICA'
   $env:ConnectionStrings__Postgres = ''
   $env:ConnectionStrings__Sqlite = 'Data Source=C:\Users\user\Documents\financia\artifacts\connected-dev.db'
   npm run api:start
   ```

   La carpeta `artifacts` debe existir. Las migraciones se ejecutan en desarrollo. Para producción consulta [API v2](V2.md); las migraciones allí son explícitas.

2. En `.env` de la app, conserva la URL/clave pública del mismo proyecto Supabase y configura `FINANCIA_API_URL`:

   ```dotenv
   # Navegador en este equipo:
   FINANCIA_API_URL=http://127.0.0.1:5080
   # Para Android emulado, sustituir por http://10.0.2.2:5080
   ```

   En un teléfono físico usa una API HTTPS accesible. Reinicia webpack/Metro después de cambiar `.env`. Nunca pongas claves secretas del servidor en este archivo.

3. Ejecuta `npm run web` o `npm run android`, inicia sesión y confirma **Conectar esta cuenta** en la pantalla de preparación. Dos dispositivos deben usar la misma cuenta y el mismo backend/base; tener el mismo correo en dos proyectos de identidad distintos no es suficiente.

4. Crea un movimiento o bolsillo. El otro dispositivo recibe un aviso SignalR y vuelve a consultar la API. También se recupera al volver al primer plano, recuperar foco/conexión en web y mediante una consulta de respaldo cada 30 segundos mientras la app está activa.

## Historial inicial y modo invitado

- Si v2 ya tiene datos, carga ese historial directamente.
- Si v2 está vacía y existe historial v1 en el servidor, se muestra el conteo y se importa esa revisión explícita. La copia local permanece separada.
- Si no hay historial del servidor, se ofrece la copia local asociada a ese UUID de usuario, o un espacio vacío si no existe.
- Si hay copia local pero quieres comenzar vacío, elige **Empezar desde cero sin importar la copia local**. Esta opción no reemplaza historial que ya exista en el servidor.
- Los datos sin propietario del formato antiguo y los del invitado nunca se asignan automáticamente a una cuenta.
- Sin URL de API, o como invitado, se conserva el almacenamiento local existente.
- Configurar una URL y encontrar un fallo de red no activa un modo local silencioso para la cuenta autenticada.

La migración preserva el original. Una cuenta importada deja de aceptar lecturas/escrituras v1. No desactives la URL para intentar trabajar sobre una copia antigua de esa cuenta: sería un historial distinto. La app todavía no implementa una caché offline de cuentas conectadas.

## Escrituras pendientes

Antes de enviar un comando, se guarda una única operación pendiente por propietario en AsyncStorage, con sus argumentos, ID y clave de idempotencia; nunca incluye tokens. Un error de almacenamiento impide enviarla.

Si la respuesta se pierde o falla la lectura posterior, se conserva ese registro y se bloquean nuevas escrituras. **Confirmar resultado** reenvía exactamente el comando original y recupera el estado del servidor; el recibo evita duplicarlo. Después de reiniciar la app se puede recuperar la misma operación. Un rechazo definitivo 400/404/409 permite corregir la operación; los fallos inciertos no descartan su clave.

Al cerrar sesión, se cancela el cliente anterior y se vacía el estado visible. El diario de esa cuenta permanece para recuperarse cuando vuelva a entrar; respuestas o avisos tardíos no se aplican a otro propietario.

## Gmail y acciones existentes

El cliente puede enviar los movimientos recuperados por la integración Gmail existente a `POST /api/v2/imports/bank`, en lotes de hasta 1000. El servidor valida cada lote, limita los IDs al espacio `gmail:`, rechaza transferencias de bolsillos y solo añade IDs ausentes. Un movimiento editado o eliminado no se sobrescribe ni reaparece por un nuevo sondeo. Este prefijo no acredita una verificación bancaria: la calidad de los datos depende del parser y sigue pendiente validar los formatos reales de los bancos.

La consulta Gmail continúa dependiendo del despliegue, permisos y proceso periódico descritos en [integración existente](GMAIL_EXISTING.md). Los resultados se incorporan a la API cuando un cliente los carga. Aún no es un conector de servidor que confirme y notifique movimientos financieros sin abrir ninguna app.

Para conservar las acciones de las pantallas se añadieron:

- `POST /api/v2/finances/clear-transactions`, cuerpo `{ expectedRevision: "…" }`: marca todos los movimientos activos eliminados si no hay saldo en bolsillos activos.
- `POST /api/v2/finances/reset`, mismo cuerpo: marca movimientos eliminados y cierra bolsillos con saldo cero, como reinicio explícito de todo el espacio; no crea devoluciones porque se elimina también el historial activo.

Requieren sesión e idempotencia, verifican la revisión de cuenta y guardan todo con su evento en una sola transacción. No eliminan físicamente los IDs ni la copia original de importación.

## Estado de validación

Pruebas de cliente con almacenamiento, identidad y transportes ficticios; endpoints C# con SQLite temporal y PostgreSQL 18 aislado, incluyendo concurrencia, idempotencia y rollback. Ver [cobertura del backend](TESTING.md). Los bundles web y Android compilan; siguen pendientes OAuth/Gmail reales y el recorrido completo con un APK instalado. Antes de usar varias instancias de API, configurar el transporte compartido de SignalR descrito en [API v2](V2.md).
