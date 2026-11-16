# Desarrollo con Docker

Este entorno ejecuta la web actual con Nginx, la API ASP.NET Core 10 y PostgreSQL 18. Docker Desktop debe estar iniciado con contenedores Linux. Solo necesitas Node/npm en el equipo para los comandos auxiliares; el SDK .NET y la compilación web se ejecutan dentro de las imágenes.

## Arrancar

1. Conserva en `.env` la URL y clave **pública** del proyecto de identidad que ya utiliza la app (`FINANCIA_SUPABASE_URL` y `FINANCIA_SUPABASE_ANON_KEY`). No se necesitan claves de servicio ni contraseñas de ese proyecto.
2. Si tienes `npm run web` o `web:connected` abierto, detén ese servidor con **Ctrl+C** en su terminal. Docker y webpack no pueden usar ambos el puerto 8080 al mismo tiempo. No inicies otro webpack mientras uses la web Docker.
3. Desde la raíz:

   ```powershell
   npm run docker:up
   npm run docker:verify
   ```

4. Abre **http://127.0.0.1:8080**. La API escucha en **http://127.0.0.1:5081** y PostgreSQL solo es accesible dentro de la red de Compose. Los servicios esperan a que su dependencia esté saludable antes de arrancar.

La primera ejecución descarga las imágenes y dependencias y tarda más. `docker:up` recompila los cambios; la web se sirve compilada y no tiene recarga automática. Después de modificar código o configuración pública, vuelve a ejecutar `docker:up` y recarga con Ctrl+Shift+R.

En Windows, el comando intenta iniciar Docker Desktop si su motor está apagado. Mantén Docker Desktop funcionando mientras uses Financia. Los servicios tienen reinicio automático cuando vuelve el motor, salvo que los hayas detenido explícitamente. Si la página queda cargada y F12 muestra `ERR_CONNECTION_REFUSED` en 5081, comprueba `docker:status` y ejecuta `docker:up`; cambiar el frontend no repara un motor detenido.

## Datos e identidad

- Se crea una contraseña aleatoria de desarrollo en `.env.docker`, ignorado por Git. Consérvala junto con el volumen: cambiarla no cambia automáticamente la contraseña de un PostgreSQL ya inicializado. No se imprime ni se incorpora al bundle web.
- La clave pública se entrega al build mediante un montaje temporal de BuildKit, sin declararla como `ARG` o `ENV` persistente. El JavaScript final sí contiene esa clave: `publishable` y `anon` están destinadas a clientes públicos. El build rechaza claves `sb_secret_`, JWT `service_role` y tokens de usuario antes de compilar. Esta comprobación detecta errores de configuración; no verifica firmas ni sustituye la autenticación.
- El comando calcula una huella de la configuración pública para invalidar la caché cuando cambia, porque modificar un secret de BuildKit no invalida su capa por sí solo. Usa los comandos npm para que esta huella y el montaje se preparen juntos.
- La base nueva se guarda en el volumen `financia-dev_postgres-data`. Reiniciar o detener los contenedores conserva ese volumen. No se comparte con `artifacts/connected-dev.db`, con `backend/Financia.Api/financia.db` ni con bases alojadas.
- Se adopta esta base nueva para empezar desde cero, según lo acordado. Cambiar de SQLite a PostgreSQL no copia sus datos. Si la pantalla detecta una copia local, elige **Empezar desde cero sin importar la copia local**. El original local no se utiliza ni se borra con esa opción. No se han migrado cuentas reales con esta configuración.
- La identidad y la integración Gmail existentes siguen usando el proyecto configurado. Docker no sustituye sus permisos OAuth ni corrige tareas Gmail pendientes. La validación de sesión continúa en cada petición autenticada; las respuestas 200 de `/auth/v1/user` indican éxito. Se reduce únicamente el nivel de registro de esas llamadas correctas en esta configuración, conservando los avisos y errores.
- El primer uso de una cuenta vacía mantiene la confirmación de origen e historial descrita en [conexión de clientes](CLIENT_CONNECTION.md). Los datos del invitado no se asignan automáticamente.

Para Android emulado, configura `FINANCIA_API_URL=http://10.0.2.2:5081` en la configuración pública y reinicia Metro antes de `npm run android`. El atajo `android:connected` apunta al backend SQLite del puerto 5080, por lo que no corresponde a este entorno. Un teléfono físico necesita una API HTTPS accesible; estos puertos se publican únicamente en la interfaz local del equipo.

## Administrar

```powershell
npm run docker:status   # Estado y salud de los servicios
npm run docker:logs     # Últimas 100 líneas
npm run docker:check    # Valida Compose sin mostrar credenciales
npm run docker:lint     # Checks oficiales de los Dockerfiles
npm run docker:verify   # HTTP, CORS, rechazo de anónimos y tablas PostgreSQL
npm run docker:stop     # Detiene el entorno; conserva los datos
```

Si necesitas cambiar puertos por un conflicto, modifica `FINANCIA_DOCKER_WEB_PORT` o `FINANCIA_DOCKER_API_PORT` en `.env.docker` y ejecuta `docker:up` de nuevo. Un origen web nuevo también debe estar autorizado entre las URLs de retorno de tu proveedor OAuth. Conserva 8080 para reutilizar el origen actual.

Este Compose es de desarrollo: habilita migraciones al iniciar una sola instancia y usa HTTP local. Antes de desplegar, prepara HTTPS, secretos del servidor, copias de seguridad, migraciones explícitas y el transporte compartido de SignalR si usas varias réplicas. La comprobación de salud y esquema no equivale a verificar OAuth ni todas las operaciones financieras contra PostgreSQL.

Referencias: [orden de inicio y salud en Compose](https://docs.docker.com/compose/how-tos/startup-order/), [contenedores ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/docker/building-net-docker-images?view=aspnetcore-10.0), [imagen oficial PostgreSQL y volumen de la versión 18](https://hub.docker.com/_/postgres), [montajes BuildKit](https://docs.docker.com/build/building/secrets/), [caché de secretos](https://docs.docker.com/build/cache/invalidation/), [claves públicas y privilegiadas de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
