# Migración a web y móvil independientes

Estado: plan de implementación. Esta documentación no mueve archivos, no migra datos ni cambia la aplicación activa.

Implementado: esquema normalizado con migraciones EF, importación/lectura v2, creación de ingresos y gastos, recibos idempotentes y notificaciones SignalR con outbox. Desactivado por defecto. Consulta [API v2](../../backend/V2.md) para distinguir lo disponible del objetivo descrito a continuación. Ninguna cuenta real se ha migrado; la app sigue usando v1 y los nuevos clientes aún están pendientes.

El modelo y los endpoints propuestos están en [Contrato inicial del backend](backend-contract.md). Deben implementarse y validarse antes de considerarlos disponibles.

## Resultado objetivo

Web React DOM y móvil React Native CLI tendrán interfaces independientes. Ambos usarán la API ASP.NET Core 10, PostgreSQL y las cuentas del mismo proyecto Supabase Auth. SignalR notificará cambios confirmados y los clientes volverán a consultar los datos autorizados.

La primera entrega es el backend compartido y su contrato. La separación física de carpetas viene después de comprobar que la persistencia nueva conserva el comportamiento financiero actual.

## Estructura objetivo

```text
financia/
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   └── mobile/
│       ├── android/
│       ├── ios/
│       ├── App.tsx
│       ├── index.js
│       ├── app.json
│       ├── package.json
│       ├── tsconfig.json
│       ├── babel.config.js
│       ├── metro.config.js
│       ├── screens/
│       ├── components/
│       ├── store/
│       └── utils/
├── backend/
│   ├── Financia.Api/
│   │   ├── Program.cs
│   │   ├── Features/
│   │   │   ├── Transactions/
│   │   │   ├── Pockets/
│   │   │   ├── Imports/
│   │   │   └── Preferences/
│   │   ├── Persistence/
│   │   ├── Migrations/
│   │   ├── Realtime/
│   │   └── Authentication/
│   ├── Financia.Api.Tests/
│   ├── global.json
│   └── README.md
├── packages/
│   ├── api-client/
│   │   ├── package.json
│   │   ├── generated/
│   │   └── index.ts
│   └── domain/
│       ├── package.json
│       ├── types/
│       ├── calculations/
│       └── index.ts
├── docs/
│   └── architecture/
├── scripts/
├── tests/
├── package.json
└── package-lock.json
```

Es un árbol de responsabilidades y ubicaciones objetivo, no un inventario de archivos ya creados. Los archivos de plataforma y configuración existentes se conservarán cuando corresponda. Se usarán npm workspaces para los clientes y paquetes TypeScript; .NET mantiene sus proyectos y restauración NuGet. Web y API se desplegarán por separado; Android/iOS conservarán su proceso de distribución.

## Pasos técnicos

1. **Fijar el contrato y los invariantes.** Inventariar `types/`, `useFinanceStore`, los repositorios local/remoto y `FinanceModels.cs`. Definir endpoints por recurso y comandos de abono/retiro; el servidor obtiene el propietario de la sesión, nunca del cuerpo enviado. Especificar importes decimales, monedas, versiones, errores e idempotencia. Mantener inicialmente `/api/finances` para compatibilidad.
2. **Preparar PostgreSQL de desarrollo y migraciones EF.** Crear una base aislada, materializar el esquema revisado y sustituir `EnsureCreated` por migraciones controladas. No apuntar una migración experimental a producción. El esquema actual creado con `EnsureCreated` necesita una estrategia de adopción o una base nueva; ejecutar `Migrate` directamente no convierte automáticamente ese historial.
3. **Construir el importador verificable.** Leer snapshots existentes por propietario, validar, normalizar y guardar dentro de una transacción. Registrar origen y resultado para que repetir la importación no duplique registros. Comparar conteos, identificadores, importes por moneda y saldos antes/después. Conservar el original y emitir un informe de inconsistencias sin descartarlas silenciosamente.
4. **Implementar las operaciones financieras en C#.** Lectura paginada, creación y eliminación de movimientos, creación de bolsillos, abonos, retiros y cierre. Cada transferencia debe actualizar movimiento y saldo atómicamente. Añadir control de concurrencia, idempotencia y pruebas de operaciones simultáneas. El adaptador temporal de `/api/finances` debe trabajar sobre la misma persistencia nueva: evitar dos fuentes de verdad.
5. **Añadir notificaciones y recuperación.** SignalR autenticado enviará avisos al usuario después del commit. La publicación fiable requiere registrar el evento en la misma transacción y un procesador que lo entregue. Los clientes tolerarán eventos duplicados, recuperarán datos al reconectar y consultarán también al volver al primer plano. Probar desconexión entre commit y aviso. Añadir infraestructura compartida de SignalR al desplegar varias instancias de API.
6. **Generar el cliente compartido.** Publicar OpenAPI desde la API y generar TypeScript en `packages/api-client`. Extraer a `packages/domain` únicamente modelos y cálculos que no dependan de React Native, navegador ni almacenamiento. La validación autoritativa y las reglas que protegen saldos permanecen en C#.
7. **Conectar el móvil actual.** Sustituir la edición de snapshots completos por comandos API. Para usuarios autenticados, el servidor será la fuente central; la caché local no confirmará escrituras fallidas. Mantener invitado local y ofrecer importación explícita a la cuenta elegida. Desconectar suscripciones y vaciar estado de la cuenta anterior al cambiar de sesión. Conservar navegación y pantallas durante esta etapa.
8. **Crear la web independiente.** Inicializar React + TypeScript + Vite y construir sus páginas con HTML/CSS. Integrar el mismo proyecto Supabase Auth, cliente API y avisos SignalR. Configurar callbacks OAuth y CORS para los orígenes reales. Verificar con dos sesiones del mismo usuario, una web y otra móvil.
9. **Mover el móvil al monorepo.** Tras estabilizar la API, trasladar la aplicación a `apps/mobile` conservando `screens`, `components`, `store` y navegación. Ajustar Metro, Babel, rutas nativas, scripts y lockfile; comprobar compilación Android y, en macOS, iOS. Eliminar el antiguo entry web/webpack únicamente cuando la web nueva cubra sus funciones.
10. **Desplegar y retirar compatibilidad.** Desplegar primero API compatible y base migrada verificada; después los clientes. Conservar respaldo y ruta de recuperación comprobada. Medir errores y comparar datos. Retirar el endpoint de snapshots solo cuando los clientes soportados ya no lo consuman. Tras nuevas escrituras normalizadas, volver a la base antigua exige reconciliación o exportación inversa; no basta cambiar una conexión.

## Datos que deben conservarse

- Los usuarios mantienen sus UUID de Supabase y su propiedad sobre cada registro. Las sesiones de web y móvil son independientes, aunque correspondan al mismo usuario.
- Los IDs de movimientos y bolsillos son cadenas existentes, no necesariamente UUID. Incluyen identificadores importados de Gmail. Preservarlos evita duplicar importaciones o romper referencias.
- DOP y USD se contabilizan por separado. Preservar importes y saldos con dos decimales; no convertir monedas ni aplicar redondeos correctivos durante la migración.
- Preservar `currentAmount` de cada bolsillo. No reconstruir automáticamente ese saldo desde movimientos sin verificar previamente el historial.
- El borrado actual de un bolsillo conserva movimientos con su `pocketId`. Una referencia a bolsillo ausente puede ser histórica y legítima; definir una representación compatible antes de imponer una clave foránea obligatoria.
- Preservar fechas, notas, categoría, emoji y cualquier `color` local presente. El modelo C# actual no incluye el `color` opcional del modelo TypeScript: contemplarlo en la migración, sin prometer recuperar valores ya perdidos en snapshots remotos anteriores.
- Los movimientos de ahorro son transferencias internas y no deben convertirse en gastos/ingresos ordinarios de los informes.
- Los datos locales antiguos sin propietario y los del invitado no se asignan automáticamente a una cuenta. La importación necesita una elección explícita y trazable.
- La integración Gmail tiene datos y acciones propias en Supabase. Coordinar deduplicación y ocultación para no reimportar movimientos eliminados; no mover sus secretos al cliente.

## Criterios de aceptación antes de separar interfaces

- Una cuenta no puede consultar, mutar ni recibir notificaciones de otra cuenta.
- La importación preserva IDs, conteos, monedas y saldos; un segundo intento no duplica datos.
- Dos abonos simultáneos no producen sobregiro. Un reintento no registra dos veces la misma operación.
- Un cambio confirmado en un dispositivo aparece en el otro; después de una desconexión ambos convergen al estado del servidor.
- Un fallo de red conserva el estado confirmado y muestra un error. Una operación pendiente de otra cuenta nunca modifica la sesión actual.
- Las pruebas financieras existentes siguen aprobando, junto con pruebas de integración reales en PostgreSQL para transacciones y concurrencia.
- Antes de mover carpetas, `npm test`, `npx tsc --noEmit` y `npm run api:test` pasan. Después del traslado, los scripts equivalentes de cada workspace y las compilaciones nativas deben pasar.

## Primera entrega ejecutable

Implementar y probar en una base aislada una operación completa: usuario autenticado crea un movimiento en la API, lo lee desde dos clientes y ambos reciben una actualización o recuperan el estado al reconectar. Completar después bolsillos e importación histórica. La separación de interfaces se apoya en esa base comprobada.
