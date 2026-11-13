# Integración Gmail existente (Supabase)

### Avisos de movimientos de BHD por Gmail

La primera versión de esta función admite los avisos de compra aprobada de `alertas@bhd.com.do` y los avisos de transferencia recibida de `notificaciones@bhd.com.do`. Procesa el historial de 90 días y luego consulta mensajes nuevos cada 15 minutos. No lee otros remitentes ni guarda el contenido de los correos; almacena el importe, moneda, tipo, fecha, comercio y un identificador para evitar duplicados. Los importes no reconocidos por el formato admitido se omiten.

Google concede `https://www.googleapis.com/auth/gmail.readonly` para toda la bandeja, no para remitentes particulares. Financia filtra en el servidor únicamente los dos remitentes de BHD admitidos. El refresco ocurre en Supabase, por lo que los correos y la credencial OAuth pasan por el servidor; la credencial se cifra con AES-GCM y no está disponible desde la app. Google clasifica este permiso como restringido: para publicar la integración puede requerirse verificación de OAuth y evaluación de seguridad. En modo de prueba, agrega tu cuenta como usuario de prueba en Google Auth Platform.

Para activar la integración en tu proyecto:

1. En Google Cloud, habilita **Gmail API** y agrega el alcance `https://www.googleapis.com/auth/gmail.readonly` en **Google Auth Platform → Data Access**. Mantén el usuario como tester mientras desarrollas; el permiso de solo lectura puede requerir verificación antes de publicar.
2. Ejecuta el SQL de `supabase/migrations/202610150001_gmail_bank_sync.sql` en el **SQL Editor** de tu proyecto Supabase.
3. Instala Supabase CLI y enlaza el proyecto (`supabase login` y `supabase link`). Despliega `gmail-connect`, `gmail-disconnect` y `gmail-poll` con `supabase functions deploy <nombre>`.
4. Configura estos secretos en **Edge Functions → Secrets** de Supabase. `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` son los mismos del cliente web OAuth registrado en Google y guardado en el proveedor Google de Supabase. Genera los otros dos valores localmente y no los compartas:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   El primero es `GMAIL_REFRESH_TOKEN_KEY` (32 bytes en Base64); el segundo es `GMAIL_CRON_SECRET`. No pongas estos secretos en `.env` ni en el repositorio.
5. En Supabase, habilita las extensiones **pg_cron**, **pg_net** y **Vault**. Guarda el Project URL, la clave pública de Supabase y `GMAIL_CRON_SECRET` en Vault con los nombres `financia_project_url`, `financia_publishable_key` y `financia_gmail_cron_secret`, respectivamente. Usa la clave pública `anon`/publishable, nunca `service_role`.
6. Ejecuta este SQL para invocar el proceso cada 15 minutos:
   ```sql
   select cron.schedule(
     'financia-gmail-poll-every-15-minutes',
     '*/15 * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'financia_project_url') || '/functions/v1/gmail-poll',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'financia_publishable_key'),
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'financia_gmail_cron_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
7. Abre Financia, entra con Google y ve a **Configuración → Lectura automática de Gmail → Autorizar Gmail de solo lectura**. Acepta el alcance de Gmail cuando Google lo solicite. Los movimientos aparecerán en el dispositivo después de la siguiente carga; la sincronización periódica depende de que hayas completado el despliegue y el cron.

La conexión puede desconectarse desde Configuración; eso revoca el permiso OAuth y detiene futuras lecturas. Los movimientos ya importados se conservan como historial. Esta primera versión solo cubre BHD; para Banreservas y Popular hacen falta ejemplos de sus propios remitentes y formatos antes de importarlos.

## Próximos pasos sugeridos
- Agregar gráfico de pie real (librería `react-native-gifted-charts`) en vez de las barras simples.
- Filtros por rango de fechas en el historial.
- El almacenamiento remoto financiero se implementa en la API C#; consulta README.md de esta carpeta.

## Actualización: cuentas, monedas y protección de ahorros

Los movimientos y bolsillos se guardan juntos por cuenta (o en un espacio de invitado independiente). Cada registro conserva DOP o USD; el selector de moneda muestra saldos e informes separados, sin conversión. Las transferencias entre el saldo disponible y los bolsillos no cuentan como ingresos o gastos en los informes.

El historial del formato anterior se conserva intacto, sin asignarlo automáticamente a una cuenta ni suponer la moneda de importaciones antiguas. Ajustes muestra el aviso y permite guardar una copia JSON del original. Restablecer el espacio actual no borra ese historial. Para incorporarlo a una cuenta hay que confirmar primero propietario y monedas.

Validación: npm run typecheck y npm test. Las pruebas utilizan almacenamiento ficticio, sin acceder a las cuentas del usuario. Consulta ANDROID_VALIDATION.md para el APK interno y las comprobaciones pendientes en un Android físico.
