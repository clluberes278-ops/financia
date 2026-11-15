# Cliente API compartido

`@financia/api-client` es un workspace TypeScript privado para web y React Native CLI. No depende de React, React Native, Expo ni de un proveedor de autenticación concreto. Sus consumidores necesitan `fetch`, `URL` y `AbortController`; la aplicación actual ya configura su entorno web/nativo. El paquete se entrega como TypeScript para compilar con Metro, Vite o webpack.

Este incremento prepara el acceso compartido: las pantallas y el almacenamiento actuales siguen usando v1. No inicializa ni migra cuentas automáticamente.

## Contrato y generación

- `openapi.json`: contrato OpenAPI 3.1 exportado sin conexión desde los DTOs y el catálogo de endpoints C#.
- `generated/models.ts`: tipos y rutas generados; no editar a mano.
- `client.ts`: HTTP, identidad de cuenta, errores, cancelación y claves de idempotencia.
- `validation.ts`: validación de respuestas usando el subconjunto de JSON Schema utilizado por el contrato, sin convertir datos.

Desde la raíz:

```powershell
npm install
npm run api:generate
npm run api:check
npm run typecheck:client
npm test
npm run api:test
```

`api:generate` vuelve a exportar el contrato C# y genera los tipos. `api:check` hace la misma exportación en una carpeta temporal y falla si los archivos versionados están desactualizados. Ambos requieren .NET 10 y dependencias NuGet restauradas, pero no necesitan servidor, credenciales ni conexión a una base. El exportador termina antes de arrancar ASP.NET o ejecutar migraciones.

Las pruebas del backend contrastan el catálogo con rutas, cuerpos y respuestas declaradas de los endpoints. Una futura operación debe añadirse al catálogo, implementarse y regenerar el cliente. Las funciones de acceso público del SDK siguen siendo explícitas; no se ejecutan operaciones desconocidas automáticamente.

## Uso

Crear una instancia por cuenta autenticada:

```typescript
import { createFinanceClient, FinanceApiError } from '@financia/api-client';

const client = createFinanceClient({
  baseUrl: 'https://tu-api.example',
  userId: activeUserId,
  getSession: async () => {
    const session = await readCurrentSession();
    return session
      ? { userId: session.userId, accessToken: session.accessToken }
      : null;
  },
});

const finances = await client.getFinances();

// Preparar y conservar estos valores una sola vez por operación de usuario.
const request = {
  id: movementId,
  currency: 'DOP' as const,
  amount: '1250.50',
  type: 'ingreso' as const,
  category: 'salario' as const,
  date: new Date().toISOString(),
};
try {
  await client.createMovement(request, { idempotencyKey: operationKey });
} catch (error: unknown) {
  if (error instanceof FinanceApiError && error.outcomeUnknown) {
    // Consultar/reconciliar; si se reintenta, usar request y operationKey originales.
  }
  throw error; // La interfaz debe mostrar el fallo; no confirmar una escritura local silenciosa.
}

// Al cerrar sesión o cambiar de cuenta:
client.dispose();
```

`activeUserId`, `readCurrentSession`, `movementId` y `operationKey` los suministra la aplicación. El paquete no guarda tokens en disco ni genera identificadores por su cuenta. La función de sesión se consulta antes de enviar y después de recibir; no reutiliza un token fijado al crear la instancia. También hay que destruir la instancia al cambiar de cuenta para cancelar solicitudes pendientes, incluso si luego vuelve a entrar el mismo usuario.

## Operaciones

`getFinances`, `importLegacy`, `createMovement`, `updateMovement`, `deleteMovement`, `createPocket`, `editPocket`, `depositToPocket`, `withdrawFromPocket` y `closePocket` usan rutas y códigos de éxito generados desde el contrato. Los comandos requieren `{ idempotencyKey, signal? }`; la lectura admite `{ signal? }`. Consulta [el contrato financiero](../../backend/LIFECYCLE.md) para los cuerpos y versiones esperadas.

Los montos v2 y las revisiones siguen siendo cadenas. La importación legacy mantiene los números del formato anterior. Una respuesta incorrecta se rechaza con `invalid_response`: no se sustituye por un historial vacío ni se convierte un importe a otro tipo.

No hay reintentos automáticos. Tras un fallo de red, timeout, cancelación o respuesta inválida, una escritura puede haberse confirmado en el servidor: `outcomeUnknown` lo indica. Conservar la misma clave y el mismo contenido evita duplicados. Un 409 requiere revisar el estado o resolver el conflicto; cambiar de clave no lo resuelve.

Las URLs exigen HTTPS, excepto HTTP en `localhost`, `127.0.0.1`, `[::1]` y `10.0.2.2`. No se admiten credenciales, fragmentos ni parámetros en la URL base; se evitan cookies y redirecciones. Los errores públicos no incluyen tokens ni mensajes internos de la conexión.

## Pendiente de integración

Este paquete cubre HTTP. La conexión SignalR, recuperación al reconectar, ciclo de vida de pantalla y caché por cuenta se conectarán al integrar móvil y web. El backend v2 sigue desactivado por defecto y conserva el límite de una instancia para las notificaciones hasta añadir un transporte compartido.
