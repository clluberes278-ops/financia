# API de Financia

ASP.NET Core 10 y Entity Framework Core. Guarda movimientos y bolsillos juntos por usuario. Usa `decimal` para importes, valida el historial y rechaza escrituras con una revisión antigua (HTTP 409).

## Ejecutar

Desde la raíz: `npm run api:start`. Requiere SDK .NET 10; el script también detecta el SDK local en `artifacts/dotnet` preparado durante la migración.

En desarrollo escucha en `http://localhost:5080`. SQLite permite trabajar sin instalar un servidor de bases de datos. El archivo `backend/Financia.Api/financia.db` no se versiona. Para PostgreSQL configura `ConnectionStrings__Postgres` en el entorno del servidor. No cambies de proveedor esperando que los datos se transfieran automáticamente.

Configura en el entorno del proceso del backend:

```powershell
$env:Authentication__SupabaseUrl = 'https://TU-PROYECTO.supabase.co'
$env:Authentication__PublishableKey = 'TU_CLAVE_PUBLICA'
npm run api:start
```

No se necesita una clave `service_role`. La API valida cada token contra el proveedor de identidad y obtiene allí el identificador del propietario. El cuerpo de la solicitud nunca elige el usuario. La autenticación Google/Apple y las funciones de Gmail actuales permanecen en Supabase: este cambio introduce el backend financiero C#, no una sustitución completa de ese proveedor.

## Conectar la app

Configura `FINANCIA_API_URL` en `.env` y reinicia Metro o webpack. Android emulado: `http://10.0.2.2:5080`; web: `http://localhost:5080`. En dispositivo físico usa un servidor HTTPS accesible o un túnel local configurado por ti. No se habilita HTTP en la app de producción.

- Sin URL: permanece el almacenamiento local actual.
- Con URL: las cuentas autenticadas usan la API v2; el backend debe tener `FinanceV2__Enabled=true`. Invitado sigue siendo local.
- La primera activación de una cuenta vacía muestra el origen y los conteos y requiere confirmación. Importa su historial v1 del servidor, o el local del mismo usuario si no hay historial remoto. El original local no se sobrescribe.
- Si el servidor ya tiene datos, prevalece su historial; el original local permanece separado y no se fusiona automáticamente.
- Las cuentas conectadas requieren red. Los fallos se muestran y no se convierten en un historial vacío ni en escrituras locales silenciosas. No hay sincronización offline ni resolución automática de conflictos.
- No desactives la URL esperando ver los cambios del servidor en la copia local original.

## Contrato

- `GET /health`: estado del proceso; no consulta la base de datos.
- `GET /api/finances`: requiere `Authorization: Bearer TOKEN`; devuelve `{ revision, snapshot }`.
- `PUT /api/finances`: mismo encabezado; recibe `{ expectedRevision, snapshot }`. Snapshot contiene `version: 1`, `transactions` y `pockets` con el formato TypeScript existente.
- `401`: sesión no válida o no verificable. `400`: historial inválido. `409`: cambió la revisión.

El esquema inicial se crea en desarrollo. En producción ejecuta `dotnet run --project Financia.Api -- --initialize-database` una vez contra una base nueva, configura HTTPS y los orígenes CORS exactos. `EnsureCreated` solo sirve para este esquema inicial: los siguientes cambios de esquema requieren migraciones EF antes de desplegar. No se ha desplegado esta API ni modificado ninguna base remota.

## Pruebas

La arquitectura compartida se documenta en [API v2](V2.md). Incluye tablas normalizadas, importación, movimientos, bolsillos y avisos SignalR con outbox; está desactivada por defecto en el servidor. Consulta el [contrato financiero](LIFECYCLE.md) y la [conexión de la app](CLIENT_CONNECTION.md). Los endpoints v1 se conservan para compatibilidad y migración; la app conectada ya utiliza v2.

`npm run api:test`: pruebas HTTP con SQLite temporal y autenticación ficticia exclusivamente en el proyecto de pruebas. Verifican aislamiento, rechazo de anónimos, conflictos y validación sin alterar datos reales. La autenticación real de Google/Apple/Gmail y PostgreSQL requieren verificación en el entorno configurado.
