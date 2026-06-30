import os

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv():
    """Minimal .env loader so ROBOFLOW_API_KEY etc. don't need to be passed
    inline on every command. .env is gitignored; never commit real secrets."""
    env_path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()
DATA_DIR = os.path.join(BASE_DIR, "data")
ROIS_PATH = os.path.join(BASE_DIR, "rois.json")
INTERSECCIONES_PATH = os.path.join(BASE_DIR, "intersecciones.json")

# Create data dir if not exists
os.makedirs(DATA_DIR, exist_ok=True)

# Video Configurations
VIDEO_PATH = os.path.join(DATA_DIR, "video.mp4")  # Legacy single-video fallback path

# Multiple demo videos selectable from the UI (Modulo 1)
AVAILABLE_VIDEOS = {
    "video1": os.path.join(DATA_DIR, "cruce_video_1.mp4"),
    "video2": os.path.join(DATA_DIR, "cruce_video_2.mp4"),
}
DEFAULT_VIDEO_KEY = "video1"

# Roboflow Inference Configurations (Modulo 1 - real vehicle detection)
# Credentials are read from environment variables only - never hardcode the key here.
ROBOFLOW_API_URL = os.environ.get("ROBOFLOW_API_URL", "https://serverless.roboflow.com")
ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
ROBOFLOW_WORKSPACE = os.environ.get("ROBOFLOW_WORKSPACE", "harold-victor")
ROBOFLOW_WORKFLOW_ID = os.environ.get("ROBOFLOW_WORKFLOW_ID", "general-segmentation-api")
ROBOFLOW_CLASSES = "car, big bus, big truck"
ROBOFLOW_CALLS_PER_SECOND = 3  # Throttle for the serverless inference thread

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
