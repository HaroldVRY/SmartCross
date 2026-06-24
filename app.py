import os
import cv2
import json
import time
import threading
import numpy as np
from collections import deque
from flask import Flask, render_template, Response, jsonify, request
from ultralytics import YOLO

import config

app = Flask(__name__)

# Thread-safe global states
latest_frame = None
frame_lock = threading.Lock()
yolo_status = "Iniciando..."
is_video_running = False

# Track which intersection is currently selected by the user
current_active_intersection = "INT-01"
intersection_lock = threading.Lock()

latest_status = {
    "lights": {
        "S1": {"count": 0, "status": "VERDE", "wait_time": 0, "recommended_extra_green": 0, "action": ""},
        "S2": {"count": 0, "status": "VERDE", "wait_time": 0, "recommended_extra_green": 0, "action": ""},
        "S3": {"count": 0, "status": "VERDE", "wait_time": 0, "recommended_extra_green": 0, "action": ""},
        "S4": {"count": 0, "status": "VERDE", "wait_time": 0, "recommended_extra_green": 0, "action": ""},
    },
    "kpis": {
        "total_vehicles": 0,
        "pct_red": 0,
        "avg_wait": 0.0,
        "congestion_level": "BAJO"
    }
}
status_lock = threading.Lock()

# Load ROIs from configuration file
def load_rois():
    if os.path.exists(config.ROIS_PATH):
        try:
            with open(config.ROIS_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error cargando ROIs: {e}")
    # Default fallback relative coordinates if rois.json is missing or corrupted
    return {
        "S1": [[0.10, 0.10], [0.45, 0.10], [0.45, 0.45], [0.10, 0.45]],
        "S2": [[0.55, 0.55], [0.90, 0.55], [0.90, 0.90], [0.55, 0.90]],
        "S3": [[0.55, 0.10], [0.90, 0.10], [0.90, 0.45], [0.55, 0.45]],
        "S4": [[0.10, 0.55], [0.45, 0.55], [0.45, 0.90], [0.10, 0.90]]
    }

# Save ROIs
def save_rois(rois_data):
    try:
        with open(config.ROIS_PATH, "w") as f:
            json.dump(rois_data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error guardando ROIs: {e}")
        return False


# ==========================================
# INTERSECTIONS DATA CACHE & SELF-HEALING
# ==========================================
DEFAULT_INTERSECTIONS = [
  {
    "id": "INT-01",
    "name": "Av. Javier Prado x Av. Arequipa",
    "lat": -12.0895,
    "lng": -77.0355,
    "status": "VERDE",
    "count": 2,
    "corridor": "Av. Javier Prado"
  },
  {
    "id": "INT-02",
    "name": "Av. Javier Prado x Av. Petit Thouars",
    "lat": -12.0900,
    "lng": -77.0370,
    "status": "AMARILLO",
    "count": 4,
    "corridor": "Av. Javier Prado"
  },
  {
    "id": "INT-03",
    "name": "Av. Javier Prado x Vía Expresa",
    "lat": -12.0915,
    "lng": -77.0300,
    "status": "VERDE",
    "count": 1,
    "corridor": "Av. Javier Prado"
  },
  {
    "id": "INT-04",
    "name": "Av. Javier Prado x Av. República de Panamá",
    "lat": -12.0925,
    "lng": -77.0260,
    "status": "ROJO",
    "count": 6,
    "corridor": "Av. Javier Prado"
  },
  {
    "id": "INT-05",
    "name": "Av. Javier Prado x Av. Salaverry",
    "lat": -12.0885,
    "lng": -77.0470,
    "status": "VERDE",
    "count": 2,
    "corridor": "Av. Javier Prado"
  },
  {
    "id": "INT-06",
    "name": "Av. Canaval y Moreyra x Vía Expresa",
    "lat": -12.0955,
    "lng": -77.0265,
    "status": "VERDE",
    "count": 1,
    "corridor": "Vía Expresa"
  },
  {
    "id": "INT-07",
    "name": "Av. Aramburú x Vía Expresa",
    "lat": -12.0985,
    "lng": -77.0275,
    "status": "AMARILLO",
    "count": 3,
    "corridor": "Vía Expresa"
  },
  {
    "id": "INT-08",
    "name": "Av. Camino Real x Av. Santa Cruz",
    "lat": -12.1005,
    "lng": -77.0380,
    "status": "VERDE",
    "count": 2,
    "corridor": "Av. Camino Real"
  }
]

def load_intersections():
    if os.path.exists(config.INTERSECCIONES_PATH):
        try:
            with open(config.INTERSECCIONES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) == 8:
                    return data
        except Exception as e:
            print(f"Error cargando intersecciones desde JSON: {e}")
            
    # Self-healing fallback if file doesn't exist, is empty, or corrupted
    print("[Server] Re-inicializando intersecciones con valores por defecto.")
    save_intersections(DEFAULT_INTERSECTIONS)
    return json.loads(json.dumps(DEFAULT_INTERSECTIONS)) # Deep copy

def save_intersections(data):
    try:
        with open(config.INTERSECCIONES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error guardando intersecciones en JSON: {e}")
        return False

# In-memory database cache and lock
intersections_data = load_intersections()
intersections_lock = threading.Lock()


# ==========================================
# TRAFFIC SIMULATOR (Fallback and Closed-loop Demo)
# ==========================================
class SimulatedVehicle:
    def __init__(self, lane, vtype):
        self.lane = lane # 'S1', 'S2', 'S3', 'S4'
        self.vtype = vtype # 'car', 'motorcycle', 'bus', 'truck'
        self.class_id = {"car": 2, "motorcycle": 3, "bus": 5, "truck": 7}[vtype]
        self.speed = np.random.uniform(0.006, 0.009)
        self.stopped = False
        
        # Initial positions (relative 0.0 to 1.0)
        if lane == 'S1':   # North to South (vertical)
            self.x = 0.42
            self.y = 0.0
        elif lane == 'S2': # South to North (vertical)
            self.x = 0.58
            self.y = 1.0
        elif lane == 'S4': # West to East (horizontal)
            self.x = 0.0
            self.y = 0.58
        elif lane == 'S3': # East to West (horizontal)
            self.x = 1.0
            self.y = 0.42

    def move(self, is_red_light, vehicle_ahead_y_or_x):
        if is_red_light:
            # Check stop line limits
            if self.lane == 'S1' and 0.25 <= self.y < 0.32:
                self.stopped = True
                return
            if self.lane == 'S2' and 0.68 < self.y <= 0.75:
                self.stopped = True
                return
            if self.lane == 'S4' and 0.25 <= self.x < 0.32:
                self.stopped = True
                return
            if self.lane == 'S3' and 0.68 < self.x <= 0.75:
                self.stopped = True
                return

        # Check spacing with vehicle in front in the same lane
        if vehicle_ahead_y_or_x is not None:
            if self.lane == 'S1' and vehicle_ahead_y_or_x - self.y < 0.07:
                self.stopped = True
                return
            if self.lane == 'S2' and self.y - vehicle_ahead_y_or_x < 0.07:
                self.stopped = True
                return
            if self.lane == 'S4' and vehicle_ahead_y_or_x - self.x < 0.07:
                self.stopped = True
                return
            if self.lane == 'S3' and self.x - vehicle_ahead_y_or_x < 0.07:
                self.stopped = True
                return

        self.stopped = False
        
        # Move
        if self.lane == 'S1':
            self.y += self.speed
        elif self.lane == 'S2':
            self.y -= self.speed
        elif self.lane == 'S4':
            self.x += self.speed
        elif self.lane == 'S3':
            self.x -= self.speed

    def is_out_of_bounds(self):
        if self.lane == 'S1' and self.y > 1.05: return True
        if self.lane == 'S2' and self.y < -0.05: return True
        if self.lane == 'S4' and self.x > 1.05: return True
        if self.lane == 'S3' and self.x < -0.05: return True
        return False

class TrafficSimulator:
    def __init__(self):
        self.vehicles = []
        self.physical_light_phase = "NS_GREEN"  # 'NS_GREEN' (S1/S2 moving) or 'EW_GREEN' (S3/S4 moving)
        self.phase_timer = 200  # Frame cycles left
        self.base_phase_duration = 180  # 6 seconds at 30fps

    def update(self, rois_congested_status):
        # 1. Update Phase Timer & Transitions
        self.phase_timer -= 1
        if self.phase_timer <= 0:
            # Change phase
            if self.physical_light_phase == "NS_GREEN":
                self.physical_light_phase = "EW_GREEN"
            else:
                self.physical_light_phase = "NS_GREEN"
            self.phase_timer = self.base_phase_duration

        # CLOSED-LOOP EXTENSION: If current phase lanes are highly congested (ROJO), extend light!
        is_extended = False
        if self.physical_light_phase == "NS_GREEN" and (rois_congested_status["S1"] == "ROJO" or rois_congested_status["S2"] == "ROJO"):
            if self.phase_timer < 30:  # If about to change, extend it
                self.phase_timer += 90  # Extend green light phase (approx +3 seconds)
                is_extended = True
        elif self.physical_light_phase == "EW_GREEN" and (rois_congested_status["S3"] == "ROJO" or rois_congested_status["S4"] == "ROJO"):
            if self.phase_timer < 30:
                self.phase_timer += 90
                is_extended = True

        # 2. Sort vehicles by position (closest to stop line or output) to check spacing
        vehicles_by_lane = {'S1': [], 'S2': [], 'S3': [], 'S4': []}
        for v in self.vehicles:
            vehicles_by_lane[v.lane].append(v)
            
        vehicles_by_lane['S1'].sort(key=lambda v: v.y, reverse=True)
        vehicles_by_lane['S2'].sort(key=lambda v: v.y, reverse=False)
        vehicles_by_lane['S4'].sort(key=lambda v: v.x, reverse=True)
        vehicles_by_lane['S3'].sort(key=lambda v: v.x, reverse=False)

        # Move vehicles
        for lane in ['S1', 'S2', 'S3', 'S4']:
            lane_vehicles = vehicles_by_lane[lane]
            is_red = False
            if lane in ['S1', 'S2'] and self.physical_light_phase == "EW_GREEN":
                is_red = True
            elif lane in ['S3', 'S4'] and self.physical_light_phase == "NS_GREEN":
                is_red = True

            for idx, v in enumerate(lane_vehicles):
                # Check vehicle ahead in front
                ahead_coord = None
                if idx > 0:
                    ahead_vehicle = lane_vehicles[idx - 1]
                    ahead_coord = ahead_vehicle.y if lane in ['S1', 'S2'] else ahead_vehicle.x
                
                v.move(is_red, ahead_coord)

        # 3. Filter out of bounds
        self.vehicles = [v for v in self.vehicles if not v.is_out_of_bounds()]

        # 4. Spawner
        for lane in ['S1', 'S2', 'S3', 'S4']:
            lane_v = [v for v in self.vehicles if v.lane == lane]
            # Check if spawn area is clear
            is_clear = True
            if lane == 'S1' and any(v.y < 0.12 for v in lane_v): is_clear = False
            if lane == 'S2' and any(v.y > 0.88 for v in lane_v): is_clear = False
            if lane == 'S4' and any(v.x < 0.12 for v in lane_v): is_clear = False
            if lane == 'S3' and any(v.x > 0.88 for v in lane_v): is_clear = False

            if is_clear and np.random.rand() < 0.04:  # Spawn rate probability
                vtype = np.random.choice(["car", "motorcycle", "bus", "truck"], p=[0.70, 0.15, 0.05, 0.10])
                self.vehicles.append(SimulatedVehicle(lane, vtype))

        return self.physical_light_phase, self.phase_timer, is_extended


# ==========================================
# CORE VIDEO PROCESSING & INFERENCE THREAD
# ==========================================
def video_processing_thread():
    global latest_frame, latest_status, yolo_status, is_video_running, current_active_intersection, intersections_data
    
    is_video_running = True
    print("[Thread] Hilo de video iniciado.")

    # 1. Initialize Moving Average queues
    counts_queues = {
        "S1": deque(maxlen=config.SMOOTHING_FRAMES),
        "S2": deque(maxlen=config.SMOOTHING_FRAMES),
        "S3": deque(maxlen=config.SMOOTHING_FRAMES),
        "S4": deque(maxlen=config.SMOOTHING_FRAMES),
    }

    # Initial labels dictionary for COCO classes
    coco_labels = {2: "Car", 3: "Moto", 5: "Bus", 7: "Truck"}
    
    # Track simulated traffic light status for simulator closed-loop
    simulated_congested_status = {"S1": "VERDE", "S2": "VERDE", "S3": "VERDE", "S4": "VERDE"}

    # 2. Check video file availability
    use_synthetic = True
    cap = None
    
    if os.path.exists(config.VIDEO_PATH):
        print(f"[Thread] Video detectado en {config.VIDEO_PATH}. Cargando modelo YOLOv8...")
        yolo_status = "Cargando YOLOv8..."
        try:
            model = YOLO(config.MODEL_PATH)
            cap = cv2.VideoCapture(config.VIDEO_PATH)
            if cap.isOpened():
                use_synthetic = False
                yolo_status = "Modelo cargado"
                print("[Thread] Video y YOLO cargados exitosamente. Detección real activa.")
            else:
                print("[Thread] No se pudo abrir el archivo de video. Cambiando a Simulación Sintética.")
                yolo_status = "Video inaccesible. Usando Simulación."
        except Exception as e:
            print(f"[Thread] Error al cargar YOLO/Video: {e}. Cambiando a Simulación Sintética.")
            yolo_status = "YOLO Error. Usando Simulación."
    else:
        print(f"[Thread] Archivo de video no encontrado en {config.VIDEO_PATH}. Iniciando Simulación Sintética.")
        yolo_status = "Simulación Activa"

    # Initialize simulator
    simulator = TrafficSimulator()
    
    # Dimensions for output frames
    width, height = 960, 540
    fluctuation_counter = 0

    while True:
        start_time = time.time()
        
        # Load latest ROIs dynamically
        rois = load_rois()

        frame = None
        detections = []

        if not use_synthetic:
            # REAL VIDEO MODE
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.1)
                    continue

            frame = cv2.resize(frame, (width, height))

            # YOLO Inference
            try:
                results = model.predict(
                    source=frame,
                    conf=config.CONFIDENCE_THRESHOLD,
                    classes=config.COCO_CLASSES,
                    verbose=False
                )
                
                # Extract detections
                for box in results[0].boxes:
                    coords = box.xyxy[0].cpu().numpy() # [x1, y1, x2, y2]
                    class_id = int(box.cls.cpu().numpy()[0])
                    conf = float(box.conf.cpu().numpy()[0])
                    
                    detections.append({
                        "box": coords,
                        "class_id": class_id,
                        "conf": conf
                    })
            except Exception as e:
                print(f"[Thread] Error en inferencia YOLO: {e}")
                cv2.putText(frame, "Inference Error", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        else:
            # SYNTHETIC SIMULATION MODE
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[:] = (75, 41, 19) # BGR navy background
            
            # Draw roads
            cv2.rectangle(frame, (int(width * 0.38), 0), (int(width * 0.62), height), (70, 70, 70), -1)
            cv2.rectangle(frame, (0, int(height * 0.38)), (width, int(height * 0.62)), (70, 70, 70), -1)
            
            # Draw lane division lines
            cv2.line(frame, (int(width * 0.5), 0), (int(width * 0.5), height), (48, 196, 244), 2)
            cv2.line(frame, (0, int(height * 0.5)), (width, int(height * 0.5)), (48, 196, 244), 2)
            
            # White stop lines
            cv2.line(frame, (int(width * 0.38), int(height * 0.32)), (int(width * 0.5), int(height * 0.32)), (255, 255, 255), 3) # S1 Norte
            cv2.line(frame, (int(width * 0.5), int(height * 0.68)), (int(width * 0.62), int(height * 0.68)), (255, 255, 255), 3) # S2 Sur
            cv2.line(frame, (int(width * 0.32), int(height * 0.5)), (int(width * 0.32), int(height * 0.62)), (255, 255, 255), 3) # S4 Oeste
            cv2.line(frame, (int(width * 0.68), int(height * 0.38)), (int(width * 0.68), int(height * 0.5)), (255, 255, 255), 3) # S3 Este

            # Update traffic simulation
            phys_phase, phys_timer, is_extended = simulator.update(simulated_congested_status)

            # Draw Physical traffic light status indicators on the roads
            s1_phys_color = (33, 161, 33) if phys_phase == "NS_GREEN" else (33, 33, 226)
            cv2.circle(frame, (int(width * 0.35), int(height * 0.32)), 8, s1_phys_color, -1)
            s2_phys_color = (33, 161, 33) if phys_phase == "NS_GREEN" else (33, 33, 226)
            cv2.circle(frame, (int(width * 0.65), int(height * 0.68)), 8, s2_phys_color, -1)
            s3_phys_color = (33, 161, 33) if phys_phase == "EW_GREEN" else (33, 33, 226)
            cv2.circle(frame, (int(width * 0.68), int(height * 0.35)), 8, s3_phys_color, -1)
            s4_phys_color = (33, 161, 33) if phys_phase == "EW_GREEN" else (33, 33, 226)
            cv2.circle(frame, (int(width * 0.32), int(height * 0.65)), 8, s4_phys_color, -1)

            # Display Phase Info on top right
            with intersection_lock:
                active_id = current_active_intersection
            phase_text = f"FASE ({active_id}): S1/S2 VERDE" if phys_phase == "NS_GREEN" else f"FASE ({active_id}): S3/S4 VERDE"
            cv2.putText(frame, phase_text, (width - 320, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            timer_text = f"Fase Timer: {int(phys_timer/30)}s"
            if is_extended:
                timer_text += " [AMPLIACIÓN ON]"
                cv2.putText(frame, timer_text, (width - 320, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (33, 226, 33), 1, cv2.LINE_AA)
            else:
                cv2.putText(frame, timer_text, (width - 320, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

            # Map simulator vehicles to detections
            for v in simulator.vehicles:
                if v.vtype == "car":
                    w_box, h_box = (25, 42) if v.lane in ['S1', 'S2'] else (42, 25)
                elif v.vtype == "motorcycle":
                    w_box, h_box = (15, 28) if v.lane in ['S1', 'S2'] else (28, 15)
                elif v.vtype == "bus":
                    w_box, h_box = (35, 75) if v.lane in ['S1', 'S2'] else (75, 35)
                else: # truck
                    w_box, h_box = (38, 85) if v.lane in ['S1', 'S2'] else (85, 38)
                
                cx_px, cy_px = v.x * width, v.y * height
                x1 = cx_px - w_box / 2
                y1 = cy_px - h_box / 2
                x2 = cx_px + w_box / 2
                y2 = cy_px + h_box / 2
                
                detections.append({
                    "box": [x1, y1, x2, y2],
                    "class_id": v.class_id,
                    "conf": 0.90 + np.random.uniform(0.01, 0.08)
                })

        # ==========================================
        # VEHICLE ROI CLASSIFICATION & COUNTING PIPELINE
        # ==========================================
        raw_counts = {"S1": 0, "S2": 0, "S3": 0, "S4": 0}
        
        # Scale relative ROI polygons to current frame dimensions
        scaled_rois = {}
        for r_id, rel_pts in rois.items():
            if rel_pts:
                pts_px = np.array([[int(pt[0] * width), int(pt[1] * height)] for pt in rel_pts], dtype=np.int32)
                scaled_rois[r_id] = pts_px
            else:
                scaled_rois[r_id] = np.empty((0, 2), dtype=np.int32)

        # Draw vehicle bounding boxes, labels, and calculate counts
        for det in detections:
            x1, y1, x2, y2 = det["box"]
            class_id = det["class_id"]
            conf = det["conf"]
            label = coco_labels.get(class_id, "Vehículo")
            
            # Centroid
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            bbox_color = (200, 200, 200)

            # Check which ROI this vehicle centroid belongs to
            assigned_roi = None
            for r_id, poly in scaled_rois.items():
                if len(poly) > 2:
                    dist = cv2.pointPolygonTest(poly, (cx, cy), False)
                    if dist >= 0:
                        raw_counts[r_id] += 1
                        assigned_roi = r_id
                        break

            # Assign color based on the ROI it belongs to (aesthetics)
            if assigned_roi == "S1":
                bbox_color = (121, 161, 33) # Green
            elif assigned_roi == "S2":
                bbox_color = (48, 196, 244) # Amber
            elif assigned_roi == "S3":
                bbox_color = (59, 59, 226) # Red
            elif assigned_roi == "S4":
                bbox_color = (246, 130, 59) # Blue

            # Draw bounding box and label
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), bbox_color, 2)
            cv2.circle(frame, (cx, cy), 4, bbox_color, -1)
            text = f"{label} {conf:.2f}"
            cv2.putText(frame, text, (int(x1), int(y1) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, bbox_color, 1, cv2.LINE_AA)

        # Draw ROIs on the frame with translucent overlay
        overlay = frame.copy()
        roi_colors = {
            "S1": (121, 161, 33),  # Green
            "S2": (48, 196, 244),  # Amber
            "S3": (59, 59, 226),   # Red
            "S4": (246, 130, 59)   # Blue
        }
        
        for r_id, poly in scaled_rois.items():
            if len(poly) > 2:
                cv2.fillPoly(overlay, [poly], roi_colors[r_id])
                cv2.polylines(frame, [poly], True, roi_colors[r_id], 2, cv2.LINE_AA)
                
                # Draw badge
                first_pt = poly[0]
                text_org = (first_pt[0] + 5, first_pt[1] + 20)
                badge_text = f"{r_id} ({raw_counts[r_id]})"
                
                (t_w, t_h), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(frame, (text_org[0] - 2, text_org[1] - t_h - 2), (text_org[0] + t_w + 2, text_org[1] + 2), (0, 0, 0), -1)
                cv2.putText(frame, badge_text, text_org, cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                
        # Blend the filled polygon overlay
        cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)

        # ==========================================
        # SMOOTHING & STATUS UPDATE PIPELINE
        # ==========================================
        for r_id in ["S1", "S2", "S3", "S4"]:
            counts_queues[r_id].append(raw_counts[r_id])
        
        # Calculate smoothed average counts
        smoothed_counts = {}
        for r_id in ["S1", "S2", "S3", "S4"]:
            q = counts_queues[r_id]
            smoothed_counts[r_id] = sum(q) / len(q) if q else 0.0

        # Run thresholding and action calculations
        lights_status = {}
        total_vehicles = 0
        red_count = 0
        total_wait_time = 0

        for r_id in ["S1", "S2", "S3", "S4"]:
            count = smoothed_counts[r_id]
            total_vehicles += count
            
            # Classify congestion status
            if count <= config.UMBRAL_BAJO:
                status = "VERDE"
            elif count <= config.UMBRAL_ALTO:
                status = "AMARILLO"
            else:
                status = "ROJO"
                red_count += 1
            
            # Feed state back to simulator
            simulated_congested_status[r_id] = status

            # Simulated waiting time (seconds)
            wait_time = int(count * 5)
            total_wait_time += wait_time

            recommended_extra_green = 0
            action_text = ""
            if status == "ROJO":
                recommended_extra_green = min(
                    config.MAX_EXTRA_TIME, 
                    config.BASE_EXTRA_TIME + int(count - config.UMBRAL_ALTO) * config.SECONDS_PER_VEHICLE
                )
                
                # Dynamic action text
                direction = config.TRAFFIC_LIGHTS[r_id]["description"]
                if r_id == "S1":
                    action_text = f"Extender VERDE +{recommended_extra_green}s en {direction}. Compensar recortando verde en S3 (Este) y S4 (Oeste)."
                elif r_id == "S2":
                    action_text = f"Extender VERDE +{recommended_extra_green}s en {direction}. Activar fase prioritaria de despeje rápido."
                elif r_id == "S3":
                    action_text = f"Activar ONDA VERDE: Coordinar con cruce en S3 para priorizar transporte y mitigar {int(count)} vehículos."
                else: # S4
                    action_text = f"Extender VERDE +{recommended_extra_green}s en {direction}. Sincronizar ciclo con intersección adyacente."

            lights_status[r_id] = {
                "count": count,
                "status": status,
                "wait_time": wait_time,
                "recommended_extra_green": recommended_extra_green,
                "action": action_text
            }

        # Calculate Global KPIs
        pct_red = int((red_count / 4.0) * 100)
        avg_wait = total_wait_time / 4.0

        # General congestion level text
        if total_vehicles <= 4:
            congestion_level = "BAJO"
        elif total_vehicles <= 10:
            congestion_level = "MODERADO"
        else:
            congestion_level = "CRÍTICO"

        # Update global status dictionary thread-safely
        with status_lock:
            latest_status["lights"] = lights_status
            latest_status["kpis"] = {
                "total_vehicles": int(round(total_vehicles)),
                "pct_red": pct_red,
                "avg_wait": avg_wait,
                "congestion_level": congestion_level
            }

        # ==========================================
        # SYNCHRONIZE ACTIVE NODE & DYNAMIC MAP SIMULATION
        # ==========================================
        # Directly modify in-memory cache list intersections_data
        with intersection_lock:
            active_id = current_active_intersection

        fluctuation_counter += 1
        with intersections_lock:
            # 1. Always sync the active node in real time
            for node in intersections_data:
                if node["id"] == active_id:
                    max_status = "VERDE"
                    if any(l["status"] == "ROJO" for l in lights_status.values()):
                        max_status = "ROJO"
                    elif any(l["status"] == "AMARILLO" for l in lights_status.values()):
                        max_status = "AMARILLO"
                    node["count"] = int(round(total_vehicles))
                    node["status"] = max_status
                    break
            
            # 2. Periodically fluctuate inactive nodes in memory (no disk writes)
            if fluctuation_counter >= 90:
                fluctuation_counter = 0
                for node in intersections_data:
                    if node["id"] != active_id:
                        change = np.random.choice([-1, 0, 1], p=[0.25, 0.50, 0.25])
                        node["count"] = int(max(0, min(8, node["count"] + change)))
                        if node["count"] <= config.UMBRAL_BAJO:
                            node["status"] = "VERDE"
                        elif node["count"] <= config.UMBRAL_ALTO:
                            node["status"] = "AMARILLO"
                        else:
                            node["status"] = "ROJO"
                # Keep file backup on changes (approx every 3 seconds)
                save_intersections(intersections_data)

        # Save processed frame thread-safely
        ret_enc, jpeg = cv2.imencode('.jpg', frame)
        if ret_enc:
            with frame_lock:
                latest_frame = jpeg.tobytes()

        # Frame rate controller (Throttle execution to match target FPS)
        elapsed = time.time() - start_time
        target_delay = 1.0 / 30.0  # target 30 fps
        sleep_time = target_delay - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)


# ==========================================
# FLASK WEB ENDPOINTS
# ==========================================

@app.route("/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/interseccion/<id>")
def interseccion_detail(id):
    global current_active_intersection, intersections_data
    with intersections_lock:
        node = next((n for n in intersections_data if n["id"] == id), None)
    if not node:
        return "Intersección no encontrada", 404
    
    with intersection_lock:
        current_active_intersection = id # Switch camera target
        
    return render_template("interseccion.html", intersection=node)

@app.route("/setup")
def setup():
    id_param = request.args.get('id', 'INT-01')
    return render_template("setup.html", intersection_id=id_param)

# MJPEG Stream generator
def gen_frames():
    global latest_frame
    while True:
        with frame_lock:
            if latest_frame is not None:
                frame_data = latest_frame
            else:
                frame_data = None
        
        if frame_data is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
        else:
            time.sleep(0.1)

@app.route("/video_feed")
def video_feed():
    return Response(gen_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/status")
def api_status():
    with status_lock:
        return jsonify(latest_status)

@app.route("/api/intersecciones")
def api_intersecciones():
    with intersections_lock:
        return jsonify(intersections_data)

@app.route("/api/update_interseccion_coords", methods=["POST"])
def api_update_interseccion_coords():
    global intersections_data
    data = request.get_json()
    if not data or "id" not in data or "lat" not in data or "lng" not in data:
        return jsonify({"success": False, "message": "Datos inválidos"}), 400
    
    with intersections_lock:
        found = False
        for node in intersections_data:
            if node["id"] == data["id"]:
                node["lat"] = data["lat"]
                node["lng"] = data["lng"]
                found = True
                break
                
        if found:
            save_intersections(intersections_data)
            return jsonify({"success": True})
            
    return jsonify({"success": False, "message": "Nodo de intersección no encontrado"}), 404

@app.route("/api/get_rois")
def api_get_rois():
    return jsonify(load_rois())

@app.route("/api/save_rois", methods=["POST"])
def api_save_rois():
    rois_data = request.get_json()
    if not rois_data:
        return jsonify({"success": False, "message": "Datos vacíos"}), 400
    
    success = save_rois(rois_data)
    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "message": "Error escribiendo config.json"}), 500

@app.route("/api/get_frame")
def api_get_frame():
    rois = load_rois()
    width, height = 960, 540
    
    if os.path.exists(config.VIDEO_PATH):
        cap = cv2.VideoCapture(config.VIDEO_PATH)
        if cap.isOpened():
            ret, frame = cap.read()
            cap.release()
            if ret:
                frame = cv2.resize(frame, (width, height))
                ret_enc, jpeg = cv2.imencode('.jpg', frame)
                if ret_enc:
                    return Response(jpeg.tobytes(), mimetype="image/jpeg")
                    
    # Fallback to simulated road background if no video is found
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (75, 41, 19) # BGR navy background
    cv2.rectangle(frame, (int(width * 0.38), 0), (int(width * 0.62), height), (70, 70, 70), -1)
    cv2.rectangle(frame, (0, int(height * 0.38)), (width, int(height * 0.62)), (70, 70, 70), -1)
    cv2.line(frame, (int(width * 0.5), 0), (int(width * 0.5), height), (48, 196, 244), 2)
    cv2.line(frame, (0, int(height * 0.5)), (width, int(height * 0.5)), (48, 196, 244), 2)
    ret_enc, jpeg = cv2.imencode('.jpg', frame)
    if ret_enc:
        return Response(jpeg.tobytes(), mimetype="image/jpeg")
    return "Error generating background", 500


# Start the background thread on startup
@app.before_request
def start_processing():
    global is_video_running
    if not is_video_running:
        t = threading.Thread(target=video_processing_thread, daemon=True)
        t.start()
        is_video_running = True


if __name__ == "__main__":
    if not is_video_running:
        t = threading.Thread(target=video_processing_thread, daemon=True)
        t.start()
        is_video_running = True
        
    print("Iniciando servidor Flask de SmartCross en http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
