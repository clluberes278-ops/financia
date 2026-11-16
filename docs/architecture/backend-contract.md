# Primera fase: datos y contrato compartido

Estado: diseño inicial para implementar. No modifica la base ni los endpoints actuales.

Estado implementado: tablas normalizadas, importación/lectura v2, operaciones financieras, recibos, outbox y hub SignalR. El backend requiere activar v2 explícitamente. Consulta [el estado implementado](../../backend/V2.md), [las operaciones](../../backend/LIFECYCLE.md) y [la conexión de la app](../../backend/CLIENT_CONNECTION.md). La app actual ya integra el cliente compartido, SignalR y recuperación del estado; la web independiente sigue pendiente.

## Decisiones

El [registro automático y manual](automatic-transactions.md) forma parte del alcance: ambos orígenes usarán las mismas reglas y la misma persistencia C#. Los detalles de conectores y revisión están en ese documento.

- C# / ASP.NET Core 10 y EF Core para la API financiera.
- PostgreSQL como fuente central para cuentas autenticadas; Supabase Auth conserva las identidades existentes.
- Web React DOM + TypeScript + Vite y móvil React Native CLI + TypeScript, con interfaces independientes.
- API HTTP para lecturas y comandos; SignalR para avisar de cambios confirmados.
- El modo invitado permanece local. Pasar sus datos a una cuenta requiere una importación explícita.
- El backend determina el propietario desde la identidad validada. Ningún comando acepta un propietario elegido por el cliente.

## Modelo relacional objetivo

Los identificadores existentes son cadenas, no necesariamente UUID. Las claves financieras serán compuestas por propietario e identificador. El identificador del propietario sí es el UUID del usuario de Supabase.

| Tabla | Campos principales | Restricciones |
| --- | --- | --- |
| finance_users | user_id UUID, revision bigint | PK user_id; revision creciente por usuario |
| pockets | user_id, id varchar(256), name varchar(200), currency, target_amount numeric(14,2), current_amount numeric(14,2), emoji varchar(64), color nullable, created_at timestamptz, version bigint, deleted_at nullable | PK (user_id, id); DOP/USD; meta positiva; saldo no negativo |
| movements | user_id, id varchar(256), currency, amount numeric(14,2), type, category, occurred_at timestamptz, note varchar(4000) nullable, pocket_id varchar(256) nullable, version bigint, deleted_at nullable | PK (user_id, id); monto positivo; tipo ingreso/gasto; categorías existentes |
| command_receipts | user_id, idempotency_key, request_hash, response_json, created_at | PK (user_id, idempotency_key); repetir la misma solicitud devuelve el resultado previo; reutilizar clave con otro contenido devuelve conflicto |
| finance_outbox | event_id UUID, user_id, revision, payload, created_at, published_at nullable | Evento persistido dentro de la misma transacción que el cambio; revisión única por usuario |

El máximo monetario se conserva en 999999999999.99. El servidor debe rechazar más de dos decimales antes de persistir: PostgreSQL puede redondear valores al asignarlos a numeric(14,2). En el contrato v2, los importes viajan como cadenas decimales (por ejemplo, "1250.50") y las revisiones como cadenas enteras para evitar pérdidas de precisión en JavaScript.

La relación de cada movimiento con su bolsillo debe mantener el mismo propietario. Los bolsillos nuevos se eliminan lógicamente para conservar las referencias históricas. Antes de imponer la FK sobre datos importados, se debe inventariar pocket_id sin bolsillo correspondiente. No borrar ni convertir silenciosamente esos movimientos en gastos ordinarios: tienen significado de transferencia interna. La importación de una cuenta con referencias no resolubles se detiene y produce un informe.

No reconstruir current_amount sumando movimientos sin comprobar antes la semántica del historial. Preservar saldos existentes y registrar cualquier discrepancia. El campo color existe en TypeScript pero no en el modelo C# actual: preservar su valor cuando esté presente en el respaldo local.

Las tablas financieras estarán en un esquema privado, sin acceso directo desde clientes mediante la Data API. Solo la API C# tendrá credenciales de base de datos. Las consultas y restricciones deben aislar propietarios incluso cuando los identificadores financieros coincidan.

## Contrato HTTP v2 propuesto

La API actual /api/finances permanece durante la transición. Estos endpoints aún no están implementados.

| Método y ruta | Comportamiento |
| --- | --- |
| GET /api/v2/finances | Estado consistente de movimientos activos y bolsillos, con revisión; mecanismo inicial de recuperación al conectar |
| POST /api/v2/movements | Crea ingreso o gasto ordinario; el cliente no puede simular una transferencia enviando pocket_id |
| PATCH /api/v2/movements/{id} | Edita un movimiento ordinario con expectedVersion |
| DELETE /api/v2/movements/{id}?expectedVersion=… | Eliminación lógica con control de versión; transferencias requieren un comando de reversión específico |
| POST /api/v2/pockets | Crea bolsillo con saldo cero |
| PATCH /api/v2/pockets/{id} | Edita nombre, meta y presentación con expectedVersion; no permite cambiar directamente el saldo |
| POST /api/v2/pockets/{id}/deposit | Abona y registra el movimiento interno de forma atómica |
| POST /api/v2/pockets/{id}/withdraw | Retira y registra el movimiento interno de forma atómica |
| POST /api/v2/pockets/{id}/close | Cierra el bolsillo y devuelve el saldo disponible mediante una transferencia atómica |
| POST /api/v2/imports/legacy | Importa a una cuenta vacía un historial validado; requiere expectedRevision igual a cero |

Todos requieren Bearer token. Todos los comandos requieren Idempotency-Key. Los cambios sobre entidades existentes incluyen expectedVersion (o expectedPocketVersion para depósitos y retiros). Los comandos financieros serializan la actualización de revisión del usuario y validan el saldo disponible por moneda dentro de la transacción.

Respuesta de escritura: entidad afectada, nuevas versiones y revisión del usuario. Error 400 para formato inválido, 401 para sesión inválida, 404 para entidad inexistente o ajena, 409 para versión antigua o clave de idempotencia incompatible. Los errores de red nunca se interpretan como datos vacíos ni como éxito local.

La primera implementación de GET devuelve el estado completo para simplificar una recuperación correcta. Antes de admitir historiales grandes, incorporar paginación por cursor con revisión consistente o un registro incremental; no paginar sobre datos cambiantes sin definir cómo recuperar una vista coherente.

## Tiempo real

Hub previsto: /hubs/finances, autenticado. El servidor deriva el destinatario de la identidad validada; el cliente no puede elegir otro usuario.

Evento: FinanceChanged { eventId, revision }. Se entrega después del commit, mediante un publicador de outbox con reintentos. Se admiten duplicados; los clientes comparan revisión y vuelven a consultar la API. Nunca se incluyen tokens ni datos de otros usuarios.

Suscribirse antes de la lectura inicial y volver a consultar si llega una revisión posterior durante esa lectura. Reconsultar al reconectar, al recuperar el foco y al volver del segundo plano. Descartar respuestas pendientes al cambiar de cuenta. Mostrar estado de conexión y errores visibles.

SignalR no es un registro durable del cliente. Si un aviso se pierde, la reconsulta recupera el estado. La primera versión exige conexión para escribir; una cola de escrituras offline sería una fase independiente con resolución de conflictos explícita.

## Primer incremento implementable

1. Crear un fixture de importación anonimizado con DOP/USD, movimientos internos, bolsillos, IDs no UUID y referencias históricas faltantes.
2. Añadir modelo EF y migraciones PostgreSQL en paralelo al modelo de documentos existente.
3. Implementar importación transaccional con comprobación de cantidades, IDs, monedas, saldos y propiedad; conservar el original.
4. Probar aislamiento y concurrencia contra PostgreSQL temporal antes de activar v2.
5. Implementar un recorrido completo: crear gasto desde un cliente y observarlo desde el otro, incluida reconexión.

No habilitar simultáneamente escrituras v1 y v2 sobre fuentes distintas para la misma cuenta. La transición necesita un indicador por cuenta y un único camino de escritura, o una ventana de mantenimiento. Volver atrás después de aceptar escrituras v2 requiere conservar y reproducir esas escrituras; el respaldo inicial por sí solo no basta.
