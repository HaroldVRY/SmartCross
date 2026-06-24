# SmartCross — Centro de Monitoreo y Regulación en Vivo

SmartCross es un sistema inteligente de regulación de tráfico autónomo que detecta la congestión vehicular en intersecciones mediante cámaras aéreas (visión por computador) y decide acciones preventivas en tiempo real para optimizar la duración de los semáforos.

Este prototipo de visualización en vivo procesa video aéreo (drones), realiza conteo suavizado por zonas (ROIs) y aplica un motor de reglas para la toma de decisiones autónomas.

---

## Características Principales

1. **Detección de Vehículos en Tiempo Real**: Utiliza **Ultralytics YOLOv8** para la detección fluida de automóviles, motocicletas, autobuses y camiones (clases del set COCO).
2. **Zonas de Intersección Interactiva (ROIs)**: Permite definir zonas poligonales personalizadas para cada acceso/semáforo (S1, S2, S3, S4) a través de una interfaz web con Canvas HTML5. Las coordenadas se guardan en un archivo `rois.json`.
3. **Suavizado de Conteo**: Implementa un filtro de promedio móvil para evitar parpadeos bruscos en el conteo de vehículos debido a oclusiones temporales.
4. **Motor de Decisiones**: Recomienda incrementos de tiempo verde de forma dinámica al identificar accesos en estado crítico (ROJO), simulando el control en bucle cerrado.
5. **Modo Simulación Integrado (Fallback)**: Si no se encuentra un video en la carpeta `data/`, el sistema arranca automáticamente una simulación visual en 2D de una intersección con flujo de tráfico dinámico regulado por semáforos, permitiendo probar la app instantáneamente.

---

## Estructura del Proyecto

```text
mysterious-bardeen/
├── app.py                   # Servidor Flask principal y lógica de procesamiento
├── config.py                # Umbrales, rutas y parámetros configurables
├── rois.json                # Coordenadas relativas de las zonas configuradas
├── requirements.txt         # Dependencias de Python
├── README.md                # Guía de configuración y ejecución
├── data/                    # Carpeta para colocar el video de dron
│   └── video.mp4            # Tu video de dron de intersección (debes colocarlo aquí)
├── templates/
│   ├── index.html           # Interfaz del Dashboard principal
│   └── setup.html           # Interfaz interactiva para dibujar ROIs
└── static/
    ├── css/
    │   └── custom.css       # Estilos visuales oscuros y animaciones
    └── js/
        ├── main.js          # Consumo de la API y actualización del Dashboard
        └── setup.js         # Lógica del Canvas para dibujar y guardar polígonos
```

---

## Instalación y Configuración

### 1. Requisitos Previos
* **Python 3.10 o superior** instalado en el sistema.
* Conexión a Internet (solo la primera vez para la descarga automática del modelo YOLOv8 ligero).

### 2. Instalar Dependencias
Abre una terminal en el directorio raíz del proyecto y ejecuta:
```bash
pip install -r requirements.txt
```

### 3. Colocar el Video
* Crea una carpeta llamada `data/` si no se ha creado automáticamente.
* Coloca tu archivo de video de dron en formato `.mp4` dentro de la carpeta `data/` con el nombre **`video.mp4`**.
* *Nota: Si no colocas ningún video, la aplicación iniciará en **Modo Simulación Sintética** para que puedas demostrar el funcionamiento inmediatamente.*

---

## Ejecución

Inicia el servidor local ejecutando:
```bash
python app.py
```

Luego, abre tu navegador web y entra a la siguiente dirección:
* **Dashboard Principal**: [http://localhost:5000](http://localhost:5000)
* **Editor de Zonas (Configuración)**: [http://localhost:5000/setup](http://localhost:5000/setup) (también accesible mediante el botón **"Configurar Zonas"** en la barra superior del dashboard).

---

## ¿Cómo configurar las Zonas (ROIs) en Vivo?

1. En el Dashboard principal, haz clic en **"Configurar Zonas"**.
2. Selecciona qué semáforo deseas configurar en el selector de la derecha (por ejemplo: `S1 — Acceso Norte`).
3. Haz clic secuencialmente sobre el video/simulador para trazar el polígono del carril. Los puntos se conectarán automáticamente.
4. Si te equivocas, haz clic en **"Limpiar Semáforo Seleccionado"** y vuelve a dibujarlo.
5. Selecciona el siguiente semáforo (`S2`, `S3`, `S4`) y repite el proceso.
6. Una vez definidos los polígonos, haz clic en el botón **"Guardar Configuración"**.
7. Haz clic en **"Volver al Dashboard"** para ver las detecciones correr sobre tus nuevas zonas personalizadas. Las coordenadas se mantendrán guardadas de forma persistente en `rois.json`.

---

## Lógica de Control y Umbrales

Todos los valores de control de congestión se pueden ajustar editando el archivo `config.py`:
* `UMBRAL_BAJO` (Default: `2`): Cantidad de autos para catalogar un acceso como libre/despejado (Estado **VERDE**).
* `UMBRAL_ALTO` (Default: `5`): Cantidad de autos límite antes de marcar un acceso congestionado. Superior a esto, se considera tráfico pesado (Estado **ROJO**).
* `SMOOTHING_FRAMES` (Default: `15`): Cantidad de fotogramas del promedio móvil para estabilizar la clasificación y evitar parpadeo.
* `MAX_EXTRA_TIME` (Default: `30`): Tiempo máximo recomendado a añadir a la luz verde (en segundos).
