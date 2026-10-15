# Financia — App de finanzas personales

## Qué hace
- **Dashboard**: saldo total (calculado, no guardado), resumen de gastos por categoría con barras de progreso, últimas 5 transacciones.
- **Transacciones**: formulario para agregar ingresos/gastos con categoría y nota, historial completo con opción de eliminar.
- Los datos creados en la app se guardan localmente con AsyncStorage. La integración opcional de Gmail usa Supabase para importar avisos BHD.

## Cómo correrlo (Android e iOS)

1. Instala Node.js (versión 18 o superior) si no lo tienes.
2. Descarga este proyecto y entra a la carpeta:
   ```bash
   cd financia
   npm install
   ```
3. Instala la app **Expo Go** en tu teléfono desde Play Store o App Store.
4. Inicia el servidor de desarrollo:
   ```bash
   npx expo start
   ```
5. Escanea el código QR que aparece en la terminal:
   - **Android**: desde la misma app Expo Go.
   - **iOS**: desde la app de Cámara nativa (te va a preguntar si quieres abrirlo en Expo Go).

Ambos verán la app funcionando en tiempo real, con hot reload — cada vez que edites un archivo, la app se actualiza sola en el teléfono.

## Estructura del proyecto
```
financia/
├── App.tsx                    # Navegación (tabs)
├── types/transaction.ts       # Modelo de datos
├── utils/calculations.ts      # Funciones puras (saldo, totales)
├── store/useTransactionStore.ts  # Estado global + persistencia
├── screens/
│   ├── DashboardScreen.tsx
│   └── TransactionsScreen.tsx
└── components/
    └── TransactionForm.tsx
```

## Generar APK (Android) e IPA (iOS) sin publicar en las tiendas

Esto usa **EAS Build**, el servicio en la nube de Expo — no necesitas Mac ni Android Studio instalados en tu PC, el build se compila en sus servidores.

### 1. Instalar y autenticarte
```bash
npm install -g eas-cli
eas login          # crea una cuenta gratis en expo.dev si no tienes
```

### 2. Android — APK instalable directo (gratis, sin cuenta de Apple/Google)
```bash
eas build --platform android --profile preview
```
Al terminar (10-20 min), te da un link de descarga del `.apk`. Ese archivo se lo mandas a quien quieras — en su teléfono debe activar "Instalar apps de fuentes desconocidas" la primera vez, y listo.

### 3. iOS — requiere cuenta de Apple Developer ($99/año)
```bash
eas build --platform ios --profile preview
```
EAS te va a pedir conectar tu cuenta de Apple Developer y te guía para registrar los UDID de los iPhones donde se va a instalar (ad-hoc), o puedes subir el resultado a **TestFlight** para no tener que pedir UDIDs uno por uno:
```bash
eas submit --platform ios
```
Con TestFlight, invitas a los testers por correo y ellos instalan la app "TestFlight" de Apple para probar la tuya — no pasa por review completo de la App Store, es distribución interna.

> Si por ahora no quieres pagar los $99/año, quédate probando en Expo Go (pasos de arriba) — funciona igual de bien para desarrollo, solo que no puedes generar un instalador independiente para otros en iOS.

## Inicio de sesión con Supabase

El inicio de sesión es opcional: Financia sigue funcionando en modo local si no configuras Supabase. La sesión de Google o Apple por sí sola **no sincroniza** los movimientos ni los bolsillos guardados en el dispositivo. La integración opcional de Gmail sí guarda en Supabase los movimientos BHD que extrae y también los importa en el almacenamiento local.

1. En el panel de Supabase, copia el **Project URL** y la clave pública **anon** (o **publishable**) del proyecto.
2. Crea un archivo `.env` en la raíz del proyecto (no compartas ni subas ese archivo) con:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   ```
   `.env.example` muestra los nombres de las variables. Nunca pongas una clave `service_role` en la app.
3. En Supabase, habilita Google y/o Apple en **Authentication → Sign In / Providers** y configura allí las credenciales OAuth de cada proveedor.
4. En **Authentication → URL Configuration → Redirect URLs**, permite el origen web de desarrollo (por ejemplo `http://localhost:8081/**`) y `financia://auth/callback`. Configura el callback del proveedor según la URL de callback que Supabase muestra para ese proveedor.
5. Reinicia Expo después de editar `.env` y abre **Configuración → Cuenta**. En builds nativos, el esquema `financia` está configurado como URL de retorno.

Las credenciales de OAuth de Google/Apple se crean en sus respectivas consolas y deben mantenerse en Supabase; la app solo contiene la clave pública de Supabase. Apple requiere una cuenta de Apple Developer para configurar el proveedor.

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
- Migrar de AsyncStorage a `expo-sqlite` si el volumen de datos crece mucho.
