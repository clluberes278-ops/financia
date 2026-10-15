# Financia — App de finanzas personales

## Qué hace
- **Dashboard**: saldo total (calculado, no guardado), resumen de gastos por categoría con barras de progreso, últimas 5 transacciones.
- **Transacciones**: formulario para agregar ingresos/gastos con categoría y nota, historial completo con opción de eliminar.
- Todo se guarda localmente en el teléfono con AsyncStorage (no requiere backend ni internet).

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

El inicio de sesión es opcional: Financia sigue funcionando en modo local si no configuras Supabase. La sesión de Google o Apple **no sincroniza todavía** los movimientos ni los bolsillos guardados en el dispositivo.

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

## Próximos pasos sugeridos
- Agregar gráfico de pie real (librería `react-native-gifted-charts`) en vez de las barras simples.
- Filtros por rango de fechas en el historial.
- Migrar de AsyncStorage a `expo-sqlite` si el volumen de datos crece mucho.
