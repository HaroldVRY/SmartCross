import os

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ROIS_PATH = os.path.join(BASE_DIR, "rois.json")
INTERSECCIONES_PATH = os.path.join(BASE_DIR, "intersecciones.json")

# Create data dir if not exists
os.makedirs(DATA_DIR, exist_ok=True)

# Video Configurations
VIDEO_PATH = os.path.join(DATA_DIR, "video.mp4")

# YOLO Model Configurations
MODEL_PATH = "yolov8n.pt"  # Will auto-download via Ultralytics
CONFIDENCE_THRESHOLD = 0.25  # Confidence to detect vehicles
COCO_CLASSES = [2, 3, 5, 7]  # car=2, motorcycle=3, bus=5, truck=7

# Congestion Thresholds
UMBRAL_BAJO = 2   # counts <= 2 -> VERDE (Green)
UMBRAL_ALTO = 5   # counts > 2 and <= 5 -> AMARILLO (Yellow), counts > 5 -> ROJO (Red)

# Moving Average Smoothing
SMOOTHING_FRAMES = 15  # Number of frames to average counts over (prevents flickering)

# Recommended Green Time Action Parameters (for ROJO status)
BASE_EXTRA_TIME = 10      # Base extra seconds if ROJO
SECONDS_PER_VEHICLE = 4   # Additional seconds per vehicle above UMBRAL_ALTO
MAX_EXTRA_TIME = 30       # Limit the maximum recommended green light extension

# Traffic Light Definitions
TRAFFIC_LIGHTS = {
    "S1": {"name": "S1-Norte", "description": "Acceso Norte"},
    "S2": {"name": "S2-Sur", "description": "Acceso Sur"},
    "S3": {"name": "S3-Este", "description": "Acceso Este"},
    "S4": {"name": "S4-Oeste", "description": "Acceso Oeste"}
}
