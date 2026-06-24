import os
import sys
import json

print("=" * 60)
print("SMARTCROSS DRIVER - SCRIPT DE VERIFICACIÓN DE ENTREGABLES")
print("=" * 60)

# Base Path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DRIVER_APP_DIR = os.path.join(BASE_DIR, "driver-app")

# 1. Check directory existence
if not os.path.exists(DRIVER_APP_DIR):
    print("[ERROR] El directorio 'driver-app' no existe.")
    sys.exit(1)
print("[*] Directorio 'driver-app': ENCONTRADO [OK]")

# 2. Check package.json existence and dependencies
package_json_path = os.path.join(DRIVER_APP_DIR, "package.json")
if not os.path.exists(package_json_path):
    print("[ERROR] No se encuentra package.json en driver-app.")
    sys.exit(1)

try:
    with open(package_json_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)
    
    deps = pkg.get("dependencies", {})
    required_deps = ["react-native-webview", "expo-location", "expo-speech"]
    missing_deps = [d for d in required_deps if d not in deps]
    
    if missing_deps:
        print(f"[ERROR] Faltan dependencias en package.json: {', '.join(missing_deps)}")
        sys.exit(1)
    else:
        print("[*] Dependencias de package.json (webview, location, speech): ENCONTRADAS [OK]")
except Exception as e:
    print(f"[ERROR] Error analizando package.json: {e}")
    sys.exit(1)

# 3. Check app.json config
app_json_path = os.path.join(DRIVER_APP_DIR, "app.json")
if not os.path.exists(app_json_path):
    print("[ERROR] No se encuentra app.json en driver-app.")
    sys.exit(1)
print("[*] Archivo app.json: ENCONTRADO [OK]")

# 4. Check App.js existence and react-native-webview import
app_js_path = os.path.join(DRIVER_APP_DIR, "App.js")
if not os.path.exists(app_js_path):
    print("[ERROR] No se encuentra App.js en driver-app.")
    sys.exit(1)

try:
    with open(app_js_path, "r", encoding="utf-8") as f:
        code = f.read()
    
    critical_imports = ["WebView", "Location", "Speech"]
    missing_imports = [i for i in critical_imports if i not in code]
    
    if missing_imports:
        print(f"[WARNING] Faltan importaciones críticas en App.js: {', '.join(missing_imports)}")
        print("    (Es posible que aún no se haya sobreescrito el archivo template de App.js)")
    else:
        print("[*] Importaciones clave en App.js (WebView, Location, Speech): VERIFICADAS [OK]")
except Exception as e:
    print(f"[ERROR] Error analizando App.js: {e}")
    sys.exit(1)

print("=" * 60)
print("VERIFICACIÓN FINALIZADA")
print("=" * 60)
sys.exit(0)
