# Edición, eliminación y bolsillos en v2

Estado: implementado en la API v2, desactivada por defecto en el servidor. La app actual ya usa estos comandos al conectar una cuenta. Consulta [configuración y autenticación](V2.md) y [activación del cliente](CLIENT_CONNECTION.md) antes de probar con una base aislada.

## Migración

La migración `20261114000100_FinanceLifecycle` añade `deleted_at` a movimientos y `closed_at` a bolsillos. Se conservan registros, IDs y referencias históricas. Los IDs eliminados o cerrados no pueden reutilizarse.

No revierte movimientos financieros: su downgrade elimina esas columnas y pierde las marcas de eliminación/cierre. Una reversión de producción requiere reconciliar ese estado; no usar el downgrade como mecanismo para deshacer una operación del usuario.

## Contrato común

Todos los comandos requieren Bearer token e `Idempotency-Key`, y una cuenta inicializada mediante la importación explícita. El propietario se obtiene de la sesión. Los importes se envían como cadenas decimales con punto y hasta dos decimales; las versiones son cadenas enteras positivas.

El servidor guarda cambios, revisión, recibo y evento de outbox en una transacción serializable. Un reintento exacto con la misma clave devuelve la respuesta original, aunque la entidad haya cambiado después. Reutilizar la clave con otra operación, otro ID o contenido distinto produce 409. Una respuesta de error no deja cambios parciales ni un recibo de éxito.

## Movimientos

- `PATCH /api/v2/movements/{id}` recibe `{ expectedVersion, currency, amount, type, category, date, note? }`. Sustituye todos los campos editables; omitir `note` la limpia. Devuelve 200 con `{ revision, movement }` y versión incrementada.
- `DELETE /api/v2/movements/{id}?expectedVersion=1` marca el registro y devuelve 200 con `{ revision, id, version, deleted: true }`.

Una versión antigua produce 409. Un ID inexistente, eliminado o de otro usuario produce 404. Los campos desconocidos se rechazan. Las transferencias con `pocketId` o categoría `ahorro` no pueden editarse ni eliminarse como movimientos ordinarios: se revierten mediante abonos y retiros del bolsillo.

Si hay saldo reservado en bolsillos de una moneda, crear, editar o eliminar un movimiento ordinario no puede dejar negativo el saldo disponible de esa moneda. Si el historial importado ya era negativo, no puede empeorarlo. Sin reservas se permite representar deuda mediante un balance negativo. La comprobación y el cambio se confirman juntos.

## Bolsillos

| Operación | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /api/v2/pockets` | `{ id, name, currency, targetAmount, emoji?, color? }` | 201 `{ revision, pocket }`; saldo cero y versión `"1"` |
| `PATCH /api/v2/pockets/{id}` | `{ expectedVersion, name, targetAmount, emoji?, color? }` | 200 `{ revision, pocket }` |
| `POST /api/v2/pockets/{id}/deposit` | `{ amount, expectedVersion }` | 200 `{ revision, pocket, movement }` |
| `POST /api/v2/pockets/{id}/withdraw` | `{ amount, expectedVersion }` | 200 `{ revision, pocket, movement }` |
| `POST /api/v2/pockets/{id}/close` | `{ expectedVersion }` | 200 `{ revision, pocket, movement }`; movement puede ser null |

Editar sustituye nombre, meta y presentación; no permite modificar moneda ni saldo directamente. `emoji` omitido usa el predeterminado; `color` omitido lo limpia. La meta puede quedar por debajo de lo ya ahorrado: no mueve dinero. Cada éxito incrementa la versión del bolsillo.

Un bolsillo inexistente, ajeno o cerrado produce 404. Una versión antigua, falta de fondos o límite de saldo excedido produce 409. Nombres, importes, versiones y presentación inválidos producen 400.

Un abono comprueba el saldo disponible de la misma moneda y genera un movimiento interno de gasto. Un retiro comprueba el saldo del bolsillo y genera un ingreso interno. Ambos usan categoría `ahorro`, referencia al bolsillo, ID y fecha generados por servidor. Los informes deben excluir estas transferencias de ingresos y gastos ordinarios.

Dos abonos simultáneos sobre bolsillos distintos comparten la revisión de cuenta: no pueden reservar el mismo saldo. Los saldos DOP y USD no se mezclan ni se convierten.

Cerrar devuelve todo el saldo restante mediante un ingreso interno, deja el bolsillo en cero y marca su cierre dentro de la misma transacción. Si estaba vacío, no genera un movimiento de importe cero. Un reintento exacto no vuelve a devolver dinero.

## Lecturas e historial

`GET /api/v2/finances` excluye movimientos eliminados y bolsillos cerrados. Mantiene los movimientos de transferencias históricas incluso si su bolsillo ya no está entre los activos. Los clientes deben tolerar esas referencias sin descartar ni reclasificar movimientos.

El bolsillo incluido en la respuesta de cierre representa su último estado; no significa que siga activo. Después de la operación los clientes deben volver a consultar la API o aplicar el resultado según el comando ejecutado.

## Comprobaciones

Las pruebas cubren actualización, cierre y borrado lógico, IDs reservados, aislamiento, versiones, reintentos, protección de ahorros, transferencias por moneda y dos abonos concurrentes que compiten por el mismo saldo. Se conserva también la respuesta original de importación después de estas operaciones.

Se ejecutan con SQLite temporal; se compara el modelo y genera SQL PostgreSQL, pero sigue pendiente validar concurrencia con un PostgreSQL real antes del despliegue.
