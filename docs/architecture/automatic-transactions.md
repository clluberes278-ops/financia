# Registro automático y manual de movimientos

Estado: pendiente final por petición del usuario el 15 de noviembre de 2026. La API v2 ya acepta lotes de movimientos recogidos por el cliente; falta completar y verificar el procesamiento autónomo de Gmail hasta la persistencia financiera. La existencia de código Gmail no demuestra que OAuth, funciones y programación periódica estén desplegados o activos.

## Comportamiento del producto

- Mantener el registro manual para efectivo, ingresos sin aviso bancario y correcciones.
- Ofrecer conexión Gmail opcional para importar gastos e ingresos detectados en avisos bancarios compatibles.
- Los movimientos reconocidos por un formato validado se pueden confirmar automáticamente si el usuario activa esa opción. Durante la introducción de un banco nuevo, comenzar con revisión de muestras y modo de previsualización.
- Los casos incompletos o ambiguos quedan pendientes y no afectan saldos ni informes. Un movimiento pendiente permite confirmar, corregir o ignorar.
- Mostrar origen (manual/Gmail), banco, estado y última sincronización. Permitir pausar y desconectar la fuente.
- Mantener ambas interfaces conectadas al mismo historial confirmado en la API C#.

## Regla de clasificación

Una entrada bancaria no demuestra una ganancia: puede ser una transferencia entre cuentas propias, un préstamo o una devolución. Una salida tampoco siempre es gasto: puede ser una transferencia interna. Conservar la distinción y enviar a revisión cuando falte información; no inferirla solo de palabras genéricas del correo.

Los movimientos programados (renta, salario previsto, suscripciones) serían otra función: mantenerlos como previsiones hasta confirmar que ocurrieron. No modificar el saldo real por una fecha estimada.

## Reutilización del código actual

Existen autorización Gmail, credenciales cifradas, un recolector programable y una tabla intermedia `bank_email_transactions`. La integración actual depende de que el cliente consulte esa tabla e importe los registros. Esto no será el camino definitivo de escritura en v2.

`genericBankEmailParser.ts` aún no es una base fiable para confirmación automática: elimina puntos de importes independientemente del formato, puede elegir números sin moneda, sustituye fechas no reconocidas por la hora actual e infiere el tipo por palabras generales. La presencia de un banco en la lista de remitentes tampoco valida el formato de sus avisos. Se requieren ejemplos anonimizados y pruebas por banco antes de habilitarlo.

## Flujo objetivo

1. El usuario autoriza Gmail desde web o móvil. Mantener el alcance y la posibilidad de desconexión visibles.
2. Un recolector en servidor consulta avisos compatibles. La app no necesita estar abierta.
3. Un parser específico valida remitente, importe, moneda, tipo y fecha, sin inventar los campos faltantes. Conservar solo los datos necesarios para trazabilidad, no el contenido completo del correo por defecto.
4. La importación crea un candidato aislado por propietario y origen. Para correos no reconocidos, mostrar al menos un aviso de formato no compatible sin incorporarlos como movimientos confirmados.
5. La API C# procesa candidatos confirmables mediante el mismo servicio de dominio que los movimientos manuales. El acceso entre servicios se autentica y autoriza en servidor; nunca aceptar un user_id arbitrario desde un cliente público.
6. La transacción guarda movimiento, recibo de idempotencia y evento en outbox. El recolector no escribe directamente las tablas financieras saltándose las reglas de la API.
7. SignalR avisa después del commit. Los clientes recuperan el historial desde la API, incluidos los cambios ocurridos durante una desconexión.

Primera entrega con consulta periódica y estado visible; no presentar un intervalo de consulta como tiempo real bancario. Los avisos de cambio Gmail mediante Pub/Sub pueden añadirse después, manteniendo recuperación y reintentos. Referencia: [notificaciones Gmail](https://developers.google.com/workspace/gmail/api/guides/push).

## Prevención de duplicados

- Clave única de origen: propietario + cuenta Gmail conectada + message_id. Es independiente de la categoría o las correcciones posteriores.
- Reprocesar un mensaje devuelve el mismo resultado, incluso si el worker se reinicia después del commit.
- Conservar un recibo de ignorado/eliminado para que una sincronización no resucite un movimiento descartado.
- Comparar candidatos automáticos con registros manuales por referencia bancaria cuando exista. Importe/moneda/fecha similares solo sugieren una coincidencia: no fusionar silenciosamente compras distintas del mismo importe.
- El usuario puede vincular un aviso al movimiento manual existente. Esta acción registra la relación de origen sin crear un segundo movimiento.
- Dos avisos sobre la misma operación bancaria pueden tener message_id diferentes; si hay una referencia bancaria fiable, usarla para conciliación. Si no la hay, solicitar revisión de la posible coincidencia.

## Orden de implementación

1. Completar comandos v2 de movimientos manuales, con recibos y outbox. Serán el servicio común para ambos orígenes.
2. Definir el primer banco y sus formatos reales de aviso de gasto e ingreso; crear fixtures anonimizados y pruebas de importes, zonas horarias y estados rechazados/pendientes.
3. Implementar candidatos y conciliación en C# conservando el aislamiento de usuarios.
4. Conectar el recolector actual a ese camino de servidor, con reintentos, errores visibles y cursor que no pierda avisos.
5. Incorporar la bandeja de revisión y el estado de sincronización en ambas interfaces.
6. Activar confirmación automática solo para formatos verificados y usuarios que la elijan; medir rechazos y evitar escrituras por parsers ambiguos.

## Criterios de aceptación

- Releer un aviso o reintentar su entrega no duplica el movimiento.
- Un cambio de formato o un número ambiguo no produce importes inventados ni movimientos confirmados.
- Los movimientos manuales siguen disponibles, incluido el modo invitado local.
- Un candidato pendiente no cambia saldos; confirmar lo incorpora una sola vez.
- Los avisos se procesan sin mantener abierta la aplicación y aparecen en ambas interfaces al sincronizar.
- No se transmiten tokens Gmail ni credenciales bancarias a los clientes.
- Desconectar detiene lecturas futuras; no elimina el historial confirmado.

Información pendiente del usuario: bancos o servicios prioritarios y si sus avisos llegan a Gmail. Si hacen falta ejemplos, usar versiones anonimizadas sin números de cuenta, tarjeta, identidad ni códigos de acceso.

## Alcance confirmado por el usuario

Prioridad: BHD, Banco Popular y Banreservas. Sus avisos llegan a Gmail. Pendiente: ejemplos anonimizados de compras y entradas para validar los remitentes exactos y formatos; no dar por certificado un banco solo porque su dominio aparezca en el código.

Se corrigió la base de importes del lector genérico para conservar separadores decimales y exigir moneda explícita junto al monto. Ya no usa números sueltos como sustituto del importe, no supone DOP para un símbolo `$` aislado y rechaza múltiples montos diferentes. Esto reduce la cobertura deliberadamente hasta disponer de parsers por formato. Estas pruebas usan datos sintéticos: no validan todavía todos los correos reales de estos bancos. Siguen pendientes la validación específica de fecha, tipo, remitente y conciliación antes de habilitar confirmación automática en v2.
