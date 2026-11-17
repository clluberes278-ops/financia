# Pruebas del backend

Desde la raíz del repositorio, con .NET 10 disponible (o el SDK local en `artifacts/dotnet`):

```powershell
npm run api:test
npm run api:test:postgres
```

El segundo comando necesita Docker Desktop iniciado. Crea un contenedor PostgreSQL 18 con nombre y contraseña aleatorios, puerto aleatorio limitado a `127.0.0.1` y almacenamiento temporal en memoria. No lee `.env`, no reutiliza `compose.yaml` y no toca el volumen de desarrollo. Al terminar, incluso si fallan las pruebas, elimina su propio contenedor.

`ApiFactory` crea una base `financia_test_<UUID>` por escenario cuando recibe `FINANCIA_TEST_POSTGRES`; elimina únicamente la base creada por esa instancia. El runner proporciona esta conexión automáticamente. No es necesario configurar credenciales de Supabase ni conectarse a un servidor remoto.

## Cobertura

La misma suite HTTP de movimientos, bolsillos, importaciones, aislamiento, recibos y outbox se ejecuta con SQLite o PostgreSQL. Las pruebas que requieren archivos SQLite y las pruebas del proveedor de identidad ficticio conservan su proveedor original; las verificaciones de contrato y generación SQL no acceden a PostgreSQL.

Los casos adicionales de PostgreSQL comprueban:

- Dos solicitudes con la misma clave que llegan juntas a la escritura: una se confirma, otra obtiene un conflicto y el reintento devuelve el recibo original sin duplicar el movimiento.
- Dos abonos a bolsillos diferentes que compiten por el mismo saldo: solo uno se confirma.
- Un fallo real de restricción al guardar la outbox: no quedan movimiento, recibo ni revisión parcial; repetir la operación tras resolver el fallo funciona.
- Migraciones sobre filas existentes, repetición de migraciones y conservación del documento legado.
- Un segundo host con v2 desactivada protege las cuentas ya importadas y permite el historial legado de otros usuarios.

Las pruebas de precisión de fechas se ejecutan con ambos proveedores, incluyendo una fecha anterior al año 2000. La API v2 normaliza fechas UTC a microsegundos para que las respuestas iniciales, lecturas y recibos coincidan con la precisión persistida por PostgreSQL.

## Validación registrada — 17 de noviembre de 2026

- Suite con PostgreSQL activado: 70 pruebas aprobadas, ninguna omitida. Este total incluye también las verificaciones sin base y los casos explícitos de SQLite descritos arriba.
- Suite SQLite: 65 pruebas aprobadas y 5 casos exclusivos de PostgreSQL omitidos explícitamente; ningún fallo.
- TypeScript estricto: aprobado.
- Los resultados locales se guardaron en `artifacts/test-results/` y los registros en `artifacts/postgres-tests.log` y `artifacts/sqlite-tests.log`; no se versionan.
- `.github/workflows/backend.yml` prepara .NET 10 y Node 22, restaura dependencias desde el lockfile y ejecuta ambas variantes en GitHub Actions.

La autenticación de estas pruebas es ficticia. No certifican OAuth real, Gmail, ejecución en un teléfono, publicación por HTTPS ni distribución de SignalR entre varias instancias de API.
