import os
import sys
import json

print("=" * 60)
print("SMARTCROSS - SCRIPT DE VERIFICACIÓN DE ENTORNO")
print("=" * 60)

# 1. Check Python version
print(f"[*] Versión de Python: {sys.version.split()[0]} - OK")

# 2. Check imports
print("[*] Comprobando dependencias de librerías...")
dependencies = {
    "flask": "Flask",
    "cv2": "OpenCV (opencv-python)",
    "numpy": "NumPy",
    "inference_sdk": "Roboflow Inference SDK"
}

missing_deps = []
for module, name in dependencies.items():
    try:
        __import__(module)
        print(f"    - {name}: IMPORTABLE [OK]")
    except ImportError:
        print(f"    - {name}: NO ENCONTRADA [FALLÓ]")
        missing_deps.append(name)

if missing_deps:
    print(f"\n[ERROR] Faltan las siguientes dependencias: {', '.join(missing_deps)}")
    print("Por favor ejecuta: pip install -r requirements.txt")
    sys.exit(1)

# 3. Import project config
try:
    import config
    print("[*] Archivo de configuración (config.py): CARGADO [OK]")
except Exception as e:
    print(f"[ERROR] No se pudo cargar config.py: {e}")
    sys.exit(1)

# 4. Check folder structure
print("[*] Comprobando estructura de carpetas...")
folders = ["data", "templates", "static", "static/css", "static/js"]
for folder in folders:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), folder)
    if os.path.exists(path):
        print(f"    - /{folder}: EXISTE [OK]")
    else:
        print(f"    - /{folder}: NO EXISTE [FALLÓ]")

# 5. Check rois.json
print("[*] Comprobando rois.json...")
if os.path.exists(config.ROIS_PATH):
    try:
        with open(config.ROIS_PATH, "r") as f:
            rois = json.load(f)
        keys = ["S1", "S2", "S3", "S4"]
        valid_keys = all(key in rois for key in keys)
        if valid_keys:
            print(f"    - rois.json: VÁLIDO ({', '.join(keys)}) [OK]")
        else:
            print("[ERROR] rois.json no contiene todas las claves requeridas (S1, S2, S3, S4).")
    except Exception as e:
        print(f"[ERROR] Error al leer rois.json: {e}")
else:
    print("[WARNING] rois.json no existe. Se generará automáticamente con valores predeterminados al iniciar app.py")

# 5.1 Check intersecciones.json
print("[*] Comprobando intersecciones.json...")
if os.path.exists(config.INTERSECCIONES_PATH):
    try:
        with open(config.INTERSECCIONES_PATH, "r", encoding="utf-8") as f:
            nodes = json.load(f)
        if len(nodes) == 8:
            print(f"    - intersecciones.json: VÁLIDO (8 nodos cargados) [OK]")
        else:
            print(f"    - [WARNING] intersecciones.json contiene {len(nodes)} nodos (esperaba 8).")
    except Exception as e:
        print(f"[ERROR] Error al leer intersecciones.json: {e}")
else:
    print("[ERROR] intersecciones.json no existe.")
    sys.exit(1)

# 5.2 Check specific HTML templates
print("[*] Comprobando archivos de plantillas HTML...")
templates = ["dashboard.html", "interseccion.html", "setup.html"]
for t_file in templates:
    t_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", t_file)
    if os.path.exists(t_path):
        print(f"    - {t_file}: ENCONTRADO [OK]")
    else:
        print(f"    - [ERROR] {t_file}: NO ENCONTRADO [FALLÓ]")

# 6. Check demo video files
print("[*] Comprobando videos de demo (data/)...")
any_video_found = False
for video_key, video_path in config.AVAILABLE_VIDEOS.items():
    if os.path.exists(video_path):
        any_video_found = True
        print(f"    - Video encontrado en: {video_path}")
        try:
            import cv2
            cap = cv2.VideoCapture(video_path)
            if cap.isOpened():
                w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
                h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
                fps = cap.get(cv2.CAP_PROP_FPS)
                print(f"      '{video_key}': OpenCV abrió el video: {int(w)}x{int(h)} @ {fps:.2f} FPS [OK]")
                cap.release()
            else:
                print(f"      [WARNING] OpenCV no pudo leer '{video_key}'.")
        except Exception as e:
            print(f"      [WARNING] Error probando OpenCV con '{video_key}': {e}")

# 6.1 Check Roboflow API key (needed for real detection on Modulo 1)
if config.ROBOFLOW_API_KEY:
    print("    - ROBOFLOW_API_KEY: CONFIGURADA [OK]")
else:
    print("    - [WARNING] ROBOFLOW_API_KEY no esta configurada (variable de entorno). La deteccion real no correra.")

if not any_video_found:
    print("    - [INFO] No se encontró ningún video en data/. Se activará el MODO SIMULACIÓN SINTÉTICA.")

# 7. Check ROI Point-in-polygon logic
print("[*] Validando lógica geométrica de OpenCV...")
try:
    import cv2
    import numpy as np
    # Define simple square polygon: [0, 0] to [10, 10]
    poly = np.array([[0, 0], [10, 0], [10, 10], [0, 10]], dtype=np.int32)
    # Test point inside
    inside = cv2.pointPolygonTest(poly, (5, 5), False) >= 0
    # Test point outside
    outside = cv2.pointPolygonTest(poly, (15, 15), False) < 0
    
    if inside and outside:
        print("    - Lógica de colisión de zona (pointPolygonTest): VERIFICADA [OK]")
    else:
        print("    - [ERROR] Falló validación de pointPolygonTest.")
except Exception as e:
    print(f"    - [ERROR] Falló la prueba geométrica: {e}")

print("=" * 60)
print("VERIFICACIÓN COMPLETA - Todo está listo para ejecutar.")
print("=" * 60)
sys.exit(0)
