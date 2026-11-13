# Revisión de persistencia y migración nativa

## Corregido

- **Contrato API/cliente:** ASP.NET serializaba `note` y `pocketId` ausentes como `null`. El validador TypeScript los permite ausentes o como texto, por lo que rechazaba movimientos válidos después de guardarlos en C#. Se omiten los valores nulos al serializar esos campos. La prueba HTTP reproduce el fallo anterior, comprueba PUT/GET y verifica que los valores presentes se conservan.
- **Validación de bolsillos:** `currentAmount` aceptaba más de dos decimales y valores superiores al límite admitido por la API. Ahora reutiliza la misma validación monetaria que los movimientos, permitiendo cero. La prueba reproduce ambos errores y comprueba valores válidos. No se redondea ni sobrescribe automáticamente un historial inválido.
- **Totales de Movimientos:** los filtros de ingresos/gastos incluían transferencias internas de ahorro. Ahora las excluyen de la lista filtrada y reutilizan los cálculos de Informes. En «Todos» siguen visibles y el saldo disponible conserva sus efectos.
- **Degradados:** se eliminó la implementación web duplicada y divergente del componente nativo; webpack sigue seleccionando `GradientView.web.tsx`. Se retiraron imports sin uso de la pantalla modificada.

## Validación

- `npm test`: 15 casos aprobados.
- `npm run api:test -- --no-restore`: 3 casos aprobados.
- `npx tsc --noEmit`: sin errores.
- Los dos nuevos casos de regresión fallaron antes de corregir el código.

## Pendiente

Esta revisión cubre los componentes y contratos indicados; no certifica toda la aplicación. Siguen pendientes las pruebas en dispositivo, OAuth/Gmail reales y PostgreSQL. La migración ya documenta esos límites en `ANDROID_VALIDATION.md`.

La lógica de formularios web/nativo sigue duplicada y puede extraerse en una revisión posterior con pruebas de comportamiento. Aún falta una recarga explícita de cambios remotos de otro dispositivo. La auditoría de dependencias documentada durante la migración también sigue pendiente.

## Limpieza de código sin uso

Se comprobaron los puntos de entrada `index.js`, `index.web.js` y `App.tsx`, las importaciones del código activo, las configuraciones de compilación y las referencias de las pruebas.

- Eliminadas cuatro copias antiguas con una comilla invertida al final del nombre: `TransactionBottomSheet`, `DashboardScreen`, `SavingsScreen` y `TransactionsScreen`. No son módulos resueltos por los puntos de entrada.
- Eliminados los siete wrappers de `app/`, desconectados de React Navigation; algunos conservaban rutas de importación inválidas. La navegación activa no cambia.
- Eliminado `TransactionForm.tsx`, sin consumidores. Los formularios utilizados son `TransactionModal` en web y `TransactionBottomSheet` en móvil.
- Eliminadas cuatro funciones sin consumidores: `getTransactionsByMonth`, `getAvailableMonths`, `getDailyAverageExpense` y `getWeeklyExpenses`.
- Eliminados tres métodos sin consumidores del almacén: `loadTransactions`, `loadPockets` y `clearAllPockets`. Los dos primeros únicamente comprobaban si había datos cargados; no cargaban datos. La carga efectiva sigue en `activateOwner`.
- Eliminados los imports sin uso `NativeText` y `Platform` detectados por TypeScript.
- Activadas las opciones `noUnusedLocals` y `noUnusedParameters` para detectar nuevas declaraciones sin uso en cada verificación. No sustituyen el análisis de módulos o exportaciones desconectados.

Se conservan las variantes `.web`/`.native`, los adaptadores de almacenamiento y las dependencias de compilación/nativas: pueden ser necesarios aunque no exista una importación directa desde una pantalla. No se borraron datos locales ni se modificó la integración remota.
