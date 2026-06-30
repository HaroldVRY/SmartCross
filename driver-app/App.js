import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Dimensions,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';

// ==========================================
// CONFIGURATIONS & INTERSECTIONS DATA
// ==========================================
const DEFAULT_INTERSECTIONS = [
  { id: "INT-05", name: "Av. Javier Prado x Av. Salaverry", lat: -12.0885, lng: -77.0470, status: "VERDE", count: 2, corridor: "Av. Javier Prado" },
  { id: "INT-02", name: "Av. Javier Prado x Av. Petit Thouars", lat: -12.0900, lng: -77.0370, status: "AMARILLO", count: 4, corridor: "Av. Javier Prado" },
  { id: "INT-01", name: "Av. Javier Prado x Av. Arequipa", lat: -12.0895, lng: -77.0355, status: "VERDE", count: 2, corridor: "Av. Javier Prado" },
  { id: "INT-03", name: "Av. Javier Prado x Vía Expresa", lat: -12.0915, lng: -77.0300, status: "VERDE", count: 1, corridor: "Av. Javier Prado" },
  { id: "INT-04", name: "Av. Javier Prado x Av. República de Panamá", lat: -12.0925, lng: -77.0260, status: "ROJO", count: 7, corridor: "Av. Javier Prado" },
  { id: "INT-06", name: "Av. Canaval y Moreyra x Vía Expresa", lat: -12.0955, lng: -77.0265, status: "VERDE", count: 1, corridor: "Vía Expresa" },
  { id: "INT-07", name: "Av. Aramburú x Vía Expresa", lat: -12.0985, lng: -77.0275, status: "AMARILLO", count: 3, corridor: "Vía Expresa" },
  { id: "INT-08", name: "Av. Camino Real x Av. Santa Cruz", lat: -12.1005, lng: -77.0380, status: "VERDE", count: 2, corridor: "Av. Camino Real" }
];

// Fallback host if flask server is unreachable (use machine IP or localhost)
const BACKEND_HOST = "http://192.168.1.100:5000"; // Can be edited in App

// Caso 2 (GLOSA real): cruce inteligente fisico usado en la feria (el mismo que
// procesa video real en el Modulo 1). Ajustar lat/lng al cruce real antes de la demo.
const GLOSA_TARGET = { id: "INT-01", lat: -12.0895, lng: -77.0355 };
// Fase fisica (NS_GREEN/EW_GREEN) durante la cual el acceso del usuario tiene verde.
// Configurable porque depende de desde que calle se aproxime el usuario en la feria.
const GLOSA_USER_GREEN_PHASE = "NS_GREEN";

// Real distance in meters between two {lat, lng} points (Haversine formula)
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Simulated waypoints for "Recorrido Demo" along Javier Prado (Salaverry to Panamá)
const DEMO_WAYPOINTS = [
  { lat: -12.0885, lng: -77.0470, speed: 0, nextLight: "INT-02", distance: 1100, lightStatus: "VERDE", lightTimer: 45, label: "Salaverry" },
  { lat: -12.0887, lng: -77.0450, speed: 38, nextLight: "INT-02", distance: 900, lightStatus: "VERDE", lightTimer: 38, label: "Prado 01" },
  { lat: -12.0889, lng: -77.0430, speed: 48, nextLight: "INT-02", distance: 700, lightStatus: "VERDE", lightTimer: 30, label: "Prado 02" },
  { lat: -12.0891, lng: -77.0410, speed: 50, nextLight: "INT-02", distance: 500, lightStatus: "AMARILLO", lightTimer: 5, label: "Prado 03" },
  { lat: -12.0893, lng: -77.0390, speed: 46, nextLight: "INT-02", distance: 220, lightStatus: "AMARILLO", lightTimer: 2, label: "Cerca Petit Thouars" },
  { lat: -12.0898, lng: -77.0375, speed: 28, nextLight: "INT-02", distance: 50, lightStatus: "ROJO", lightTimer: 18, label: "Cola Petit Thouars" },
  { lat: -12.0900, lng: -77.0370, speed: 12, nextLight: "INT-02", distance: 0, lightStatus: "VERDE", lightTimer: 20, label: "Cruce Petit Thouars" },
  { lat: -12.0897, lng: -77.0360, speed: 35, nextLight: "INT-01", distance: 60, lightStatus: "VERDE", lightTimer: 22, label: "Entre Arequipa" },
  { lat: -12.0895, lng: -77.0355, speed: 48, nextLight: "INT-01", distance: 0, lightStatus: "VERDE", lightTimer: 18, label: "Cruce Arequipa" },
  { lat: -12.0898, lng: -77.0340, speed: 52, nextLight: "INT-03", distance: 450, lightStatus: "VERDE", lightTimer: 28, label: "Prado 04" },
  { lat: -12.0902, lng: -77.0325, speed: 58, nextLight: "INT-03", distance: 280, lightStatus: "VERDE", lightTimer: 18, label: "Prado 05" },
  { lat: -12.0910, lng: -77.0310, speed: 50, nextLight: "INT-03", distance: 110, lightStatus: "VERDE", lightTimer: 10, label: "Cerca Vía Expresa" },
  { lat: -12.0915, lng: -77.0300, speed: 45, nextLight: "INT-03", distance: 0, lightStatus: "VERDE", lightTimer: 4, label: "Cruce Vía Expresa" },
  { lat: -12.0918, lng: -77.0285, speed: 51, nextLight: "INT-04", distance: 300, lightStatus: "ROJO", lightTimer: 35, label: "Prado 06" },
  { lat: -12.0921, lng: -77.0270, speed: 32, nextLight: "INT-04", distance: 120, lightStatus: "ROJO", lightTimer: 18, label: "Cola Panamá" },
  { lat: -12.0925, lng: -77.0260, speed: 0, nextLight: "INT-04", distance: 0, lightStatus: "ROJO", lightTimer: 10, label: "Cruce Panamá" }
];

// Custom HTML mapping string using Leaflet.js
const LEAFLET_MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #13294B; }
    .leaflet-container { background-color: #13294B !important; }
    .leaflet-control-attribution { background-color: rgba(19, 41, 75, 0.75) !important; color: rgba(255,255,255,0.5) !important; font-size: 8px !important; }
    .leaflet-control-attribution a { color: rgba(255,255,255,0.65) !important; }
    
    /* Glowing circle markers */
    .marker-pin {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
      transition: all 0.3s ease;
    }
    .marker-pin-green {
      background-color: #21A179;
      box-shadow: 0 0 8px #21A179, 0 1px 6px rgba(0, 0, 0, 0.6);
    }
    .marker-pin-amber {
      background-color: #F4C430;
      box-shadow: 0 0 8px #F4C430, 0 1px 6px rgba(0, 0, 0, 0.6);
    }
    .marker-pin-red {
      background-color: #E23B3B;
      box-shadow: 0 0 12px #E23B3B, 0 1px 6px rgba(0, 0, 0, 0.6);
      animation: pulse-red 1.5s infinite ease-in-out;
    }
    @keyframes pulse-red {
      0%, 100% { transform: scale(1); box-shadow: 0 0 8px #E23B3B; }
      50% { transform: scale(1.15); box-shadow: 0 0 16px #E23B3B; }
    }

    /* Pulsing user GPS dot */
    .user-marker {
      width: 16px;
      height: 16px;
      background-color: #3b82f6;
      border: 2.5px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 12px #3b82f6, 0 2px 6px rgba(0,0,0,0.5);
      position: relative;
    }
    .user-marker::after {
      content: '';
      position: absolute;
      top: -6px; left: -6px; right: -6px; bottom: -6px;
      border: 2.5px solid rgba(59, 130, 246, 0.5);
      border-radius: 50%;
      animation: user-pulse 1.6s infinite ease-out;
    }
    @keyframes user-pulse {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    /* Leaflet tooltip styles */
    .leaflet-tooltip {
      background-color: #1e293b !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #f1f5f9 !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      border-radius: 4px !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4) !important;
      padding: 3px 6px !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-12.097, -77.036], 14);

    // CARTO Dark Matter tiles: dark theme natively, no invert() hack needed.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    var markers = {};
    var userMarker = null;
    var jpPolyline = null;
    var activeRouteLine = null;

    var statusColors = {
      "VERDE": "marker-pin-green",
      "AMARILLO": "marker-pin-amber",
      "ROJO": "marker-pin-red"
    };

    // Listen to map clicks to set destination coords
    map.on('click', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'mapClick',
        lat: e.latlng.lat,
        lng: e.latlng.lng
      }));
    });

    // Update intersections markers on the map
    function drawIntersections(nodes) {
      nodes.forEach(function(node) {
        var colorClass = statusColors[node.status] || "marker-pin-green";
        var icon = L.divIcon({
          className: 'custom-div-icon',
          html: '<div class="marker-pin ' + colorClass + '"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        if (!markers[node.id]) {
          markers[node.id] = L.marker([node.lat, node.lng], { icon: icon })
            .bindTooltip(node.id + ": " + node.count + " veh", { direction: 'top', offset: [0, -7] })
            .addTo(map);
          
          markers[node.id].on('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'markerClick',
              id: node.id,
              name: node.name
            }));
          });
        } else {
          markers[node.id].setLatLng([node.lat, node.lng]);
          markers[node.id].setIcon(icon);
          markers[node.id].setTooltipContent(node.id + ": " + node.count + " veh");
        }
      });

      // Highlight Av. Javier Prado Corridor Polyline (Green Wave Corridor)
      var jpNodes = nodes.filter(function(n) { return n.corridor === 'Av. Javier Prado'; })
                         .sort(function(a, b) { return a.lng - b.lng; });
      var jpCoords = jpNodes.map(function(n) { return [n.lat, n.lng]; });
      
      if (jpCoords.length > 1) {
        if (!jpPolyline) {
          jpPolyline = L.polyline(jpCoords, { color: '#21A179', weight: 5, opacity: 0.6, dashArray: '6, 10' }).addTo(map);
        } else {
          jpPolyline.setLatLngs(jpCoords);
        }
      }
    }

    // Update user position on the map
    function drawUserLocation(lat, lng) {
      var userIcon = L.divIcon({
        className: 'user-icon',
        html: '<div class="user-marker"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
        map.setView([lat, lng], 16);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
    }

    // Center map on coordinates
    function centerMap(lat, lng, zoomLevel) {
      map.setView([lat, lng], zoomLevel || 16);
    }

    // Draw route polyline
    function setRoute(coords) {
      if (activeRouteLine) {
        map.removeLayer(activeRouteLine);
      }
      if (coords && coords.length > 0) {
        activeRouteLine = L.polyline(coords, { color: '#3b82f6', weight: 6, opacity: 0.75 }).addTo(map);
        map.fitBounds(activeRouteLine.getBounds(), { padding: [50, 50] });
      }
    }

    function clearRoute() {
      if (activeRouteLine) {
        map.removeLayer(activeRouteLine);
        activeRouteLine = null;
      }
    }
  </script>
</body>
</html>
`;

export default function App() {
  // Navigation Screens State
  const [activeTab, setActiveTab] = useState('mapa'); // 'mapa', 'metricas', 'settings'
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(true);
  const [isNightMode, setIsNightMode] = useState(true); // Dark mode default

  // GPS & Live Data States
  const [location, setLocation] = useState({ lat: -12.097, lng: -77.036 });
  const [speed, setSpeed] = useState(0); // km/h
  const [intersections, setIntersections] = useState(DEFAULT_INTERSECTIONS);
  const [backendIp, setBackendIp] = useState(BACKEND_HOST);
  const [isConnected, setIsConnected] = useState(false);
  const [physicalLight, setPhysicalLight] = useState({ phase: "NS_GREEN", seconds_remaining: 0, extended: false });

  // Search & Navigation States
  const [searchQuery, setSearchQuery] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [destination, setDestination] = useState(null);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0); // 0 = SmartCross (Fast), 1 = Direct
  const [nextLight, setNextLight] = useState({ id: 'INT-02', status: 'VERDE', timer: 25, distance: 300 });
  const [glosaAdvisory, setGlosaAdvisory] = useState({ active: false, speed: 50, msg: 'Estable' });

  // Demo Simulation States
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);

  // Alertas Feed
  const [alerts, setAlerts] = useState([
    { id: 1, time: 'Hace 2 min', type: 'predictive', text: 'Congestión alta en Av. Arequipa. Recomendado desvío por Javier Prado.' }
  ]);

  // WebView Ref to communicate
  const webViewRef = useRef(null);
  const demoIntervalRef = useRef(null);

  // ==========================================
  // SPEECH TEXT GUIDE HANDLER
  // ==========================================
  const speakText = useCallback((text) => {
    if (isVoiceActive) {
      Speech.stop();
      Speech.speak(text, { language: 'es-ES', pitch: 1.0, rate: 0.95 });
    }
  }, [isVoiceActive]);

  // ==========================================
  // GPS LOCATION TRACKING (Caso 1 y Caso 2 - siempre activo, no depende del demo guionado)
  // ==========================================
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permiso de localización denegado.');
        return;
      }

      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1500,
          distanceInterval: 5,
        },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          // Convert m/s to km/h
          const kmh = Math.round((loc.coords.speed || 0) * 3.6) || 0;

          setLocation({ lat, lng });
          setSpeed(kmh);

          // Inject location to map
          sendToMap(`drawUserLocation(${lat}, ${lng})`);
        }
      );
    })();
  }, []);

  // ==========================================
  // BACKEND API POLLING (Caso 1: cruces reales / Caso 2: estado real del semaforo)
  // ==========================================
  useEffect(() => {
    const fetchIntersections = () => {
      fetch(`${backendIp}/api/intersecciones`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setIntersections(data);
            setIsConnected(true);
            // Push updated markers to webview
            sendToMap(`drawIntersections(${JSON.stringify(data)})`);
          }
        })
        .catch(err => {
          setIsConnected(false);
        });
    };

    fetchIntersections();
    const interval = setInterval(fetchIntersections, 3000);
    return () => clearInterval(interval);
  }, [backendIp]);

  useEffect(() => {
    const fetchPhysicalLight = () => {
      fetch(`${backendIp}/api/status`)
        .then(res => res.json())
        .then(data => {
          if (data && data.physical_light) {
            setPhysicalLight(data.physical_light);
          }
        })
        .catch(() => { /* el badge LIVE/LOCAL ya refleja la desconexion */ });
    };

    fetchPhysicalLight();
    const interval = setInterval(fetchPhysicalLight, 1500);
    return () => clearInterval(interval);
  }, [backendIp]);

  // ==========================================
  // GLOSA REAL (Caso 2): distancia real GPS -> cruce inteligente real + fase/tiempo reales del backend
  // ==========================================
  useEffect(() => {
    if (isDemoActive) return; // el modo practica offline guionado controla su propio glosaAdvisory/nextLight

    const distanceMeters = haversineMeters(location, GLOSA_TARGET);
    const userHasGreen = physicalLight.phase === GLOSA_USER_GREEN_PHASE;
    const secondsToFlip = physicalLight.seconds_remaining || 0;
    const etaSeconds = speed > 1 ? distanceMeters / (speed * 1000 / 3600) : null;

    let msg = 'Estable';
    if (userHasGreen) {
      msg = (etaSeconds !== null && etaSeconds > secondsToFlip + 3)
        ? 'Acelera ligeramente'
        : 'Mantén velocidad, vas en onda verde';
    } else {
      msg = (etaSeconds !== null && etaSeconds < secondsToFlip)
        ? 'Reduce la velocidad, evita llegar en rojo'
        : 'Mantén velocidad, llegarás en verde';
    }

    setGlosaAdvisory({ active: true, speed: null, msg });
    setNextLight({
      id: GLOSA_TARGET.id,
      status: userHasGreen ? 'VERDE' : 'ROJO',
      timer: Math.round(secondsToFlip),
      distance: Math.round(distanceMeters),
    });
  }, [location, speed, physicalLight, isDemoActive]);

  // Helper to run JS on Leaflet WebView
  const sendToMap = (code) => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(code);
    }
  };

  // Handle messages sent from Leaflet WebView
  const handleMapMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapClick' || data.type === 'markerClick') {
        const destName = data.name || `Coordenadas (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})`;
        const destCoords = { lat: data.lat || -12.0925, lng: data.lng || -77.0260 };
        
        setSearchQuery(destName);
        setDestination(destCoords);
        triggerRouting(destCoords);
      }
    } catch (e) {
      console.log("Error parsing webview message:", e);
    }
  };

  // Trigger Routing Display (SmartCross route vs Direct)
  const triggerRouting = (dest) => {
    // Generate route coordinates from current location to destination
    // In our prototype, we trace Av. Javier Prado path
    const smartCrossCoords = [
      [-12.0885, -77.0470], // Salaverry
      [-12.0900, -77.0370], // Petit Thouars
      [-12.0895, -77.0355], // Arequipa
      [-12.0915, -77.0300], // Vía Expresa
      [-12.0925, -77.0260]  // Panamá (destination)
    ];

    const directCoords = [
      [-12.0885, -77.0470],
      [-12.0895, -77.0355],
      [-12.0985, -77.0275], // desviado por Aramburú
      [-12.0925, -77.0260]
    ];

    // Plot default SmartCross route initially
    sendToMap(`setRoute(${JSON.stringify(smartCrossCoords)})`);
    setIsNavigating(true);
    speakText("Ruta calculada. Onda verde coordinada disponible en Avenida Javier Prado. Tiempo estimado ahorrado: cuatro minutos.");
  };

  const selectRoute = (index) => {
    setActiveRouteIndex(index);
    const smartCrossCoords = [
      [-12.0885, -77.0470],
      [-12.0900, -77.0370],
      [-12.0895, -77.0355],
      [-12.0915, -77.0300],
      [-12.0925, -77.0260]
    ];
    const directCoords = [
      [-12.0885, -77.0470],
      [-12.0895, -77.0355],
      [-12.0985, -77.0275],
      [-12.0925, -77.0260]
    ];
    sendToMap(`setRoute(${JSON.stringify(index === 0 ? smartCrossCoords : directCoords)})`);
  };

  const cancelNavigation = () => {
    setIsNavigating(false);
    setDestination(null);
    setSearchQuery('');
    sendToMap('clearRoute()');
    if (isDemoActive) {
      stopDemo();
    }
  };

  // ==========================================
  // INTERACTIVE DEMO SIMULATION LOOP
  // ==========================================
  const startDemo = () => {
    if (isDemoActive) return;
    
    setIsDemoActive(true);
    setIsDrivingMode(true);
    setDemoIndex(0);
    setIsNavigating(true);
    
    // Set destination name
    setSearchQuery("Av. Javier Prado x Av. Rep. de Panamá");

    // Draw full corridor route immediately
    const fullCorridor = DEMO_WAYPOINTS.map(w => [w.lat, w.lng]);
    sendToMap(`setRoute(${JSON.stringify(fullCorridor)})`);

    let idx = 0;
    
    // First voice cue
    speakText("Iniciando recorrido demostrativo SmartCross. Conducción guiada por Avenida Javier Prado activa.");

    demoIntervalRef.current = setInterval(() => {
      if (idx >= DEMO_WAYPOINTS.length) {
        clearInterval(demoIntervalRef.current);
        setIsDemoActive(false);
        setSpeed(0);
        speakText("Recorrido completado. Tiempo total ahorrado con regulación autónoma SmartCross: cuatro minutos con veinte segundos. Huella de carbono reducida en ciento cincuenta gramos de CO2.");
        return;
      }

      const waypoint = DEMO_WAYPOINTS[idx];
      setLocation({ lat: waypoint.lat, lng: waypoint.lng });
      setSpeed(waypoint.speed);
      setNextLight({
        id: waypoint.nextLight,
        status: waypoint.lightStatus,
        timer: waypoint.lightTimer,
        distance: waypoint.distance
      });

      // Update map marker
      sendToMap(`drawUserLocation(${waypoint.lat}, ${waypoint.lng})`);
      sendToMap(`centerMap(${waypoint.lat}, ${waypoint.lng}, 17)`);

      // GLOSA Advisory logic
      const targetSpeed = 50;
      if (waypoint.speed === 0) {
        setGlosaAdvisory({ active: true, speed: targetSpeed, msg: 'Semáforo en Rojo. Deténgase.' });
      } else if (waypoint.speed < 40) {
        setGlosaAdvisory({ active: true, speed: targetSpeed, msg: 'Acelera ligeramente' });
      } else if (waypoint.speed > 55) {
        setGlosaAdvisory({ active: true, speed: targetSpeed, msg: 'Reduce un poco' });
      } else {
        setGlosaAdvisory({ active: true, speed: targetSpeed, msg: 'Mantén velocidad' });
      }

      // Voice prompts triggers at key indexes
      if (idx === 3) {
        speakText("Onda verde sincronizada detectada. Mantenga cincuenta kilómetros por hora para pasar los próximos tres semáforos.");
      } else if (idx === 5) {
        speakText("Próximo cruce Petit Thouars congestionado. Reduciendo velocidad aconsejada a treinta kilómetros por hora para evitar detención.");
      } else if (idx === 7) {
        speakText("Semáforo despejado. Proceda.");
      } else if (idx === 10) {
        // Predictive alert warning
        const newAlert = {
          id: Date.now(),
          time: 'Ahora',
          type: 'predictive',
          text: 'Atasco en Av. Arequipa. Tráfico desviado exitosamente por onda verde Javier Prado.'
        };
        setAlerts(prev => [newAlert, ...prev]);
        speakText("Alerta predictiva. Congestión alta detectada en Avenida Arequipa en ocho minutos. El sistema ha ajustado los semáforos del desvío.");
      } else if (idx === 14) {
        speakText("Cruce inteligente República de Panamá reporta tráfico intenso. SmartCross ha extendido la luz verde quince segundos para aliviar la carga.");
      }

      setDemoIndex(idx);
      idx++;
    }, 1500); // Step every 1.5 seconds
  };

  const stopDemo = () => {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
    }
    setIsDemoActive(false);
    setIsDrivingMode(false);
    setSpeed(0);
    setDemoIndex(0);
    setGlosaAdvisory({ active: false, speed: 50, msg: 'Estable' });
  };

  useEffect(() => {
    return () => {
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={[styles.outerContainer, isNightMode ? styles.bgDark : styles.bgLight]}>
      <StatusBar barStyle={isNightMode ? "light-content" : "dark-content"} />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SmartCross Conductor</Text>
          <Text style={styles.headerSubtitle}>San Isidro, Lima · GPS Activo</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity 
            style={[styles.connectionBadge, isConnected ? styles.bgConnected : styles.bgDisconnected]}
            onPress={() => Alert.alert("Estado de Conexión", isConnected ? "Conectado al servidor central de SmartCross." : "Offline. Utilizando base de datos local e in-memory.")}
          >
            <Text style={styles.connectionText}>{isConnected ? "LIVE" : "LOCAL"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MAIN SCREEN SECTIONS */}
      {activeTab === 'mapa' && (
        <View style={styles.screenContainer}>
          {/* WebView containing Leaflet Map */}
          <View style={styles.mapWrapper}>
            <WebView
              ref={webViewRef}
              source={{ html: LEAFLET_MAP_HTML }}
              onMessage={handleMapMessage}
              onLoadEnd={() => {
                // Initialize map elements
                sendToMap(`drawUserLocation(${location.lat}, ${location.lng})`);
                sendToMap(`drawIntersections(${JSON.stringify(intersections)})`);
              }}
              style={styles.webview}
            />

            {/* Float HUD Buttons */}
            <View style={styles.floatButtonsContainer}>
              <TouchableOpacity 
                style={[styles.circleFloatButton, isNightMode ? styles.btnGlassDark : styles.btnGlassLight]}
                onPress={() => sendToMap(`centerMap(${location.lat}, ${location.lng}, 16)`)}
              >
                <Text style={styles.floatIconText}>🧭</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.circleFloatButton, isDrivingMode ? styles.btnConnected : (isNightMode ? styles.btnGlassDark : styles.btnGlassLight)]}
                onPress={() => setIsDrivingMode(!isDrivingMode)}
              >
                <Text style={styles.floatIconText}>🚗</Text>
              </TouchableOpacity>
            </View>

            {/* Standard Dashboard Overlays */}
            {!isDrivingMode && !isNavigating && (
              <View style={styles.overlaySearchCard}>
                <View style={styles.searchBarWrapper}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="¿A dónde vas?"
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={() => triggerRouting(location)}
                  />
                </View>

                {/* Favorites buttons */}
                <View style={styles.favoritesRow}>
                  <TouchableOpacity style={styles.favBtn} onPress={() => triggerRouting(location)}>
                    <Text style={styles.favIcon}>🏠</Text>
                    <Text style={styles.favText}>Casa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.favBtn} onPress={() => triggerRouting(location)}>
                    <Text style={styles.favIcon}>💼</Text>
                    <Text style={styles.favText}>Trabajo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Routing Selection Panel */}
            {isNavigating && !isDrivingMode && (
              <View style={styles.routeSelectorCard}>
                <Text style={styles.routeTitle}>Rutas Sugeridas</Text>
                <TouchableOpacity 
                  style={[styles.routeOption, activeRouteIndex === 0 ? styles.routeActive : styles.routeInactive]}
                  onPress={() => selectRoute(0)}
                >
                  <View>
                    <Text style={styles.routeOptTitle}>🟢 Vía Fluida SmartCross</Text>
                    <Text style={styles.routeOptDesc}>Por Av. Javier Prado con Onda Verde</Text>
                  </View>
                  <View style={styles.routeRight}>
                    <Text style={styles.routeTime}>8 min</Text>
                    <Text style={styles.routeSavedText}>Ahorra 4m</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.routeOption, activeRouteIndex === 1 ? styles.routeActive : styles.routeInactive]}
                  onPress={() => selectRoute(1)}
                >
                  <View>
                    <Text style={styles.routeOptTitle}>⚪ Vía Directa Convencional</Text>
                    <Text style={styles.routeOptDesc}>Por Av. Aramburú (Atasco detectado)</Text>
                  </View>
                  <View style={styles.routeRight}>
                    <Text style={styles.routeTime}>12 min</Text>
                    <Text style={styles.routeDirectText}>+4m demora</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.routeFooter}>
                  <TouchableOpacity style={styles.btnRouteCancel} onPress={cancelNavigation}>
                    <Text style={styles.btnRouteCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnRouteStart} onPress={() => setIsDrivingMode(true)}>
                    <Text style={styles.btnRouteStartText}>Iniciar Conducción</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* DRIVING MODE SIMPLIFIED LAYOUT */}
            {isDrivingMode && (
              <View style={styles.drivingHUDWrapper}>
                
                {/* Speedometer & Navigation indicators */}
                <View style={styles.topHudRow}>
                  <View style={styles.speedometerCard}>
                    <Text style={styles.hudSpeedNum}>{speed}</Text>
                    <Text style={styles.hudSpeedUnit}>km/h</Text>
                  </View>
                  
                  {/* GLOSA green wave advice */}
                  {glosaAdvisory.active ? (
                    <View style={[styles.glosaAdvisoryCard, 
                      glosaAdvisory.msg.includes('Acelera') ? styles.bgAmber : 
                      glosaAdvisory.msg.includes('Reduce') ? styles.bgRed : styles.bgGreen
                    ]}>
                      <Text style={styles.glosaLabel}>ONDA VERDE {isDemoActive ? '(PRACTICA)' : 'REAL'}</Text>
                      {glosaAdvisory.speed != null && (
                        <Text style={styles.glosaSpeedText}>Aconsejado: {glosaAdvisory.speed} km/h</Text>
                      )}
                      <Text style={styles.glosaAdviceMsg}>{glosaAdvisory.msg}</Text>
                    </View>
                  ) : (
                    <View style={styles.glosaAdvisoryCardOffline}>
                      <Text style={styles.glosaLabel}>CORREDOR J. PRADO</Text>
                      <Text style={styles.glosaSpeedText}>Coordinación GPS</Text>
                      <Text style={styles.glosaAdviceMsg}>Buscando Semáforo...</Text>
                    </View>
                  )}
                </View>

                {/* Next light countdown indicator */}
                <View style={styles.hudCardRow}>
                  <View style={styles.hudSmallCard}>
                    <Text style={styles.hudCardLabel}>PRÓXIMO SEMÁFORO</Text>
                    <Text style={styles.hudCardValue}>{nextLight.id}</Text>
                    <View style={styles.hudLightRow}>
                      <Text style={[styles.hudLightCircle, 
                        nextLight.status === 'VERDE' ? styles.lightOnGreen : 
                        nextLight.status === 'AMARILLO' ? styles.lightOnAmber : styles.lightOnRed
                      ]}>🚥</Text>
                      <Text style={styles.hudTimerText}>
                        {nextLight.status === 'ROJO' ? `Verde en ~${nextLight.timer}s` : "Pasa ahora"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.hudSmallCard}>
                    <Text style={styles.hudCardLabel}>DISTANCIA RESTANTE</Text>
                    <Text style={styles.hudCardValue}>{nextLight.distance} metros</Text>
                    <Text style={styles.hudCardSub}>Hacia: {nextLight.id}</Text>
                  </View>
                </View>

                {/* Cancel demo/driving button */}
                <View style={styles.hudFooter}>
                  {isDemoActive && (
                    <Text style={styles.demoProgressText}>
                      Demo: {demoIndex + 1}/{DEMO_WAYPOINTS.length} ({DEMO_WAYPOINTS[demoIndex].label})
                    </Text>
                  )}
                  <TouchableOpacity style={styles.hudExitBtn} onPress={cancelNavigation}>
                    <Text style={styles.hudExitBtnText}>Salir de Navegación</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      )}

      {activeTab === 'metricas' && (
        <ScrollView style={styles.metricsContainer}>
          <Text style={styles.tabTitle}>Tus Estadísticas Eco-Smart</Text>
          
          <View style={styles.metricsGrid}>
            <View style={styles.metricBigCard}>
              <Text style={styles.metricVal}>4.2 h</Text>
              <Text style={styles.metricLbl}>Tiempo Total Ahorrado</Text>
              <Text style={styles.metricDesc}>Evitado en congestionamientos de San Isidro.</Text>
            </View>

            <View style={styles.metricBigCard}>
              <Text style={[styles.metricVal, styles.colorGreen]}>3.8 kg</Text>
              <Text style={styles.metricLbl}>Emisiones CO₂ Evitadas</Text>
              <Text style={styles.metricDesc}>Gracias a transitar fluidamente por corredores.</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricSubVal}>32</Text>
              <Text style={styles.metricSubLbl}>Viajes Sincronizados</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricSubVal}>92%</Text>
              <Text style={styles.metricSubLbl}>Uso de Onda Verde</Text>
            </View>
          </View>

          {/* Alertas Feed log */}
          <Text style={styles.sectionTitle}>Alertas Recientes</Text>
          {alerts.map(a => (
            <View key={a.id} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertTime}>{a.time}</Text>
                <Text style={styles.alertTypeBadge}>PREDICTIVA</Text>
              </View>
              <Text style={styles.alertText}>{a.text}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'settings' && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.settingsContainer}
        >
          <Text style={styles.tabTitle}>Configuración de Conductor</Text>
          
          <View style={styles.settingOptionRow}>
            <View>
              <Text style={styles.settingTitle}>Guía por Voz Activa</Text>
              <Text style={styles.settingDesc}>Text-to-Speech para avisos de velocidad y desvíos.</Text>
            </View>
            <Switch 
              value={isVoiceActive} 
              onValueChange={setIsVoiceActive} 
              trackColor={{ false: '#475569', true: '#21A179' }}
              thumbColor={isVoiceActive ? '#ffffff' : '#94a3b8'}
            />
          </View>

          <View style={styles.settingOptionRow}>
            <View>
              <Text style={styles.settingTitle}>Modo Noche Automático</Text>
              <Text style={styles.settingDesc}>Ajustar a contrastes de baja luminosidad.</Text>
            </View>
            <Switch 
              value={isNightMode} 
              onValueChange={setIsNightMode} 
              trackColor={{ false: '#475569', true: '#21A179' }}
              thumbColor={isNightMode ? '#ffffff' : '#94a3b8'}
            />
          </View>

          <View style={styles.settingsFormGroup}>
            <Text style={styles.settingsFormLabel}>IP del Servidor SmartCross</Text>
            <TextInput
              style={styles.settingsInput}
              value={backendIp}
              onChangeText={setBackendIp}
              placeholder="http://192.168.1.100:5000"
              placeholderTextColor="#64748B"
            />
            <Text style={styles.settingsFormDesc}>
              Requerido para sincronizar semáforos reales con el dashboard central.
            </Text>
          </View>

          <View style={styles.settingOptionRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.settingTitle}>Modo Práctica Offline</Text>
              <Text style={styles.settingDesc}>
                Recorrido guionado de demostración (no usa GPS ni datos reales). Apagado por defecto para no
                mezclarse con el Mapa en Vivo y el Asesor de Onda Verde reales.
              </Text>
            </View>
            <Switch
              value={isDemoActive}
              onValueChange={(val) => (val ? startDemo() : stopDemo())}
              trackColor={{ false: '#475569', true: '#F4C430' }}
              thumbColor={isDemoActive ? '#ffffff' : '#94a3b8'}
            />
          </View>

          <View style={styles.creditsCard}>
            <Text style={styles.creditsTitle}>SmartCross Driver v1.0.0</Text>
            <Text style={styles.creditsDesc}>Diseñado para demostración en vivo. Feria de Proyectos.</Text>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* FOOTER TAB NAVIGATOR */}
      <View style={styles.footerNav}>
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'mapa' && styles.navItemActive]}
          onPress={() => setActiveTab('mapa')}
        >
          <Text style={styles.navIcon}>🗺️</Text>
          <Text style={styles.navText}>Mapa</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'metricas' && styles.navItemActive]}
          onPress={() => setActiveTab('metricas')}
        >
          <Text style={styles.navIcon}>📊</Text>
          <Text style={styles.navText}>Métricas</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeTab === 'settings' && styles.navItemActive]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={styles.navIcon}>⚙️</Text>
          <Text style={[styles.navText, {fontSize: 10}]}>Ajustes</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// CUSTOM STYLING (SmartCross Dark Theme Theme)
// ==========================================
const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  bgDark: {
    backgroundColor: '#13294B', // Navy Background
  },
  bgLight: {
    backgroundColor: '#f8fafc',
  },
  screenContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bgConnected: {
    backgroundColor: '#21A179',
  },
  bgDisconnected: {
    backgroundColor: '#475569',
  },
  connectionText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  floatButtonsContainer: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
  },
  circleFloatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnGlassDark: {
    backgroundColor: 'rgba(22, 42, 73, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnGlassLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  btnConnected: {
    backgroundColor: '#21A179',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  floatIconText: {
    fontSize: 18,
  },
  overlaySearchCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(22, 42, 73, 0.85)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  favoritesRow: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'space-around',
  },
  favBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  favIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  favText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '500',
  },
  demoStartBtn: {
    marginTop: 14,
    backgroundColor: '#21A179',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoStartBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  routeSelectorCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(22, 42, 73, 0.9)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  routeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  routeActive: {
    backgroundColor: 'rgba(33, 161, 121, 0.15)',
    borderColor: '#21A179',
  },
  routeInactive: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  routeOptTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  routeOptDesc: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  routeRight: {
    alignItems: 'flex-end',
  },
  routeTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  routeSavedText: {
    fontSize: 9,
    color: '#21A179',
    fontWeight: 'bold',
    marginTop: 2,
  },
  routeDirectText: {
    fontSize: 9,
    color: '#e23b3b',
    fontWeight: 'bold',
    marginTop: 2,
  },
  routeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  btnRouteCancel: {
    width: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  btnRouteCancelText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 12,
  },
  btnRouteStart: {
    width: '45%',
    backgroundColor: '#3b82f6',
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRouteStartText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  drivingHUDWrapper: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(22, 42, 73, 0.92)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topHudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  speedometerCard: {
    backgroundColor: '#0c1a30',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    width: '35%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  hudSpeedNum: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
  },
  hudSpeedUnit: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  glosaAdvisoryCard: {
    width: '60%',
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  glosaAdvisoryCardOffline: {
    width: '60%',
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgGreen: {
    backgroundColor: 'rgba(33, 161, 121, 0.15)',
    borderWidth: 1.5,
    borderColor: '#21A179',
  },
  bgAmber: {
    backgroundColor: 'rgba(244, 196, 48, 0.15)',
    borderWidth: 1.5,
    borderColor: '#F4C430',
  },
  bgRed: {
    backgroundColor: 'rgba(226, 59, 59, 0.15)',
    borderWidth: 1.5,
    borderColor: '#E23B3B',
  },
  glosaLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#f8fafc',
    letterSpacing: 1.5,
  },
  glosaSpeedText: {
    fontSize: 11,
    color: '#e2e8f0',
    marginTop: 2,
    fontWeight: '500',
  },
  glosaAdviceMsg: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  hudCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hudSmallCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 10,
    borderRadius: 10,
    width: '48%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  hudCardLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  hudCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  hudCardSub: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
  },
  hudLightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  hudLightCircle: {
    fontSize: 14,
    marginRight: 6,
  },
  hudTimerText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#cbd5e1',
  },
  hudFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  demoProgressText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  hudExitBtn: {
    backgroundColor: 'rgba(226, 59, 59, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e23b3b',
    marginLeft: 'auto',
  },
  hudExitBtnText: {
    color: '#e23b3b',
    fontWeight: '700',
    fontSize: 10,
  },
  metricsContainer: {
    flex: 1,
    padding: 20,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricBigCard: {
    width: '100%',
    backgroundColor: 'rgba(22, 42, 73, 0.8)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metricVal: {
    fontSize: 32,
    fontWeight: '800',
    color: '#3b82f6',
  },
  colorGreen: {
    color: '#21A179',
  },
  metricLbl: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 4,
  },
  metricDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 15,
  },
  metricCard: {
    width: '48%',
    backgroundColor: 'rgba(22, 42, 73, 0.8)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  metricSubVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
  },
  metricSubLbl: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 10,
  },
  alertCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: 'bold',
  },
  alertTypeBadge: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#f4c430',
    backgroundColor: 'rgba(244,196,48,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  alertText: {
    color: '#e2e8f0',
    fontSize: 11,
    lineHeight: 14,
  },
  settingsContainer: {
    flex: 1,
    padding: 20,
  },
  settingOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 42, 73, 0.8)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  settingDesc: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
    maxWidth: 240,
  },
  settingsFormGroup: {
    backgroundColor: 'rgba(22, 42, 73, 0.8)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  settingsFormLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  settingsInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: '#ffffff',
    height: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  settingsFormDesc: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 6,
  },
  creditsCard: {
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
  },
  creditsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#cbd5e1',
  },
  creditsDesc: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
  },
  footerNav: {
    height: 64,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0c1a30',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '33%',
    opacity: 0.5,
  },
  navItemActive: {
    opacity: 1,
  },
  navIcon: {
    fontSize: 16,
  },
  navText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
