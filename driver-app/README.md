# SmartCross Conductor (Aplicación Móvil)

Esta es la aplicación móvil complementaria de **SmartCross** diseñada para conductores en San Isidro (Lima). Ayuda a optimizar los tiempos de viaje mediante consejos de velocidad en vivo para capturar la "onda verde" en avenidas principales y desviar rutas en caso de incidentes o congestión predictiva.

Desarrollada con **React Native** y **Expo**, está lista para probarse en celulares físicos con la aplicación **Expo Go**.

---

## Características de la App Móvil

1. **Mapa de Tráfico de San Isidro**: Renderiza un mapa Leaflet en modo noche, mostrando de forma visual las vías principales coloreadas por congestión (Verde, Ámbar, Rojo).
2. **Asesor de Velocidad (GLOSA)**: Informa al conductor de la velocidad óptima recomendada (ej. `50 km/h`) en corredores coordinados para cruzar semáforos consecutivos sin detenerse.
3. **Indicador de Próximo Semáforo**: Cuenta regresiva estimada hasta el cambio de luz del cruce adelante en la ruta.
4. **Navegación por Voz (Manos Libres)**: Utiliza síntesis de voz (`expo-speech`) para hablar al conductor dándole indicaciones viales, avisos de onda verde e incidentes predictivos.
5. **Panel Eco-Smart**: Panel de estadísticas del conductor con viajes realizados, minutos ahorrados en congestión y cantidad de CO₂ neto evitado a la atmósfera.
6. **Modo Conducción HUD**: Panel de control de contraste alto con letras grandes e indicadores clave para poder leerlos al volante.
7. **Modo Demo (Walkthrough)**: Un sistema de simulación que maneja automáticamente al vehículo virtual a lo largo de la Av. Javier Prado, disparando todas las alertas visuales y sonoras en puntos específicos del trayecto.

---

## Requisitos de Ejecución

* **Node.js** instalado en la computadora.
* Un celular físico con la aplicación **Expo Go** instalada (disponible gratis en [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) o [iOS App Store](https://apps.apple.com/us/app/expo-go/id984021021)).
* Que tanto la computadora como el teléfono celular estén conectados a la **misma red Wi-Fi**.

---

## Guía de Configuración e Inicio

### 1. Instalar Dependencias
Abre una terminal dentro de la carpeta `driver-app` y ejecuta:
```bash
npm install
```
*(Nota: Las librerías de WebView, Location y Speech ya han sido instaladas previamente).*

### 2. Iniciar el Servidor de Desarrollo Expo
Ejecuta el siguiente comando para iniciar el servidor local de Expo:
```bash
npx expo start
```
Esto mostrará un **código QR gigante** en la terminal y abrirá la consola de herramientas de desarrollo de Expo.

### 3. Abrir la App en tu Teléfono
* **Android**: Abre la aplicación **Expo Go** en tu celular, presiona en **"Scan QR Code"** y escanea el código de la terminal.
* **iOS**: Abre la aplicación de **Cámara** nativa de tu iPhone, enfoca el código QR y presiona en el enlace emergente para abrirlo en **Expo Go**.

---

## Conexión Live con el Panel Central (Opcional)

Para recibir las actualizaciones de tráfico y ubicaciones del panel central de SmartCross:
1. Identifica la IP local de tu computadora en la red (ej: `192.168.1.102` en Windows se puede ver ejecutando `ipconfig` en el cmd).
2. En la aplicación móvil, ve a la pestaña de **Ajustes** (ícono de engranaje en la esquina inferior derecha).
3. Introduce la dirección IP local de tu máquina apuntando al puerto de Flask en el campo **IP del Servidor SmartCross**:
   * Ejemplo: `http://192.168.1.102:5000`
4. Presiona guardar. Si tu servidor de Flask (`app.py`) está corriendo en la computadora, la app móvil mostrará el indicador **LIVE** en el encabezado superior y consumirá la información real de tráfico e intersecciones.
5. Si no configuras la conexión, la app trabajará en **Modo Local** consumiendo datos simulados de forma offline para asegurar la viabilidad de la demo.

---

## ¿Cómo iniciar el Recorrido Demo?

1. En la pantalla principal de la aplicación, presiona el botón destacado de **🏎️ Iniciar Recorrido Demo**.
2. La app cambiará automáticamente al **Modo HUD de Conducción**.
3. Verás que el coche virtual empieza a avanzar en el mapa por la Av. Javier Prado, el velocímetro marcará velocidad en vivo, el indicador de semáforo iniciará cuentas regresivas y la app hablará dándote guías audibles para onda verde y desvíos.
