let map;
let mapMarkers = {};
let corridorPolyline = null;
let incidentEvents = [];
let waitTimeHistory = [12, 14, 15, 13, 11, 10, 15, 17, 18, 16, 15, 14, 15, 16, 18]; // History data queue for sparkline

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Map
    // Centered in San Isidro, Lima (-12.097, -77.036)
    map = L.map("map", {
        zoomControl: true,
        attributionControl: false
    }).setView([-12.097, -77.036], 14);

    // Add standard OpenStreetMap tiles
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
    }).addTo(map);

    // Start clock updater
    updateClock();
    setInterval(updateClock, 1000);

    // Initial load and set interval
    loadDashboardData();
    setInterval(loadDashboardData, 2000); // Poll intersections API every 2 seconds
});

// Update the header clock
function updateClock() {
    const clockEl = document.getElementById("header-clock");
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    }
}

// Generate styled Leaflet DivIcons based on status
function getMarkerIcon(status) {
    let colorClass = "marker-pin-green";
    if (status === "AMARILLO") {
        colorClass = "marker-pin-amber";
    } else if (status === "ROJO") {
        colorClass = "marker-pin-red";
    }
    
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="marker-pin ${colorClass}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// REST call to update coordinates when a marker is dragged
function updateIntersectionCoords(id, lat, lng) {
    const statusMsg = document.getElementById("live-indicator-text");
    const prevText = statusMsg.textContent;
    statusMsg.textContent = "GUARDANDO COORDS...";
    statusMsg.classList.replace("text-red-500", "text-amber-500");

    fetch("/api/update_interseccion_coords", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, lat, lng })
    })
    .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
    })
    .then(data => {
        statusMsg.textContent = "EN VIVO";
        statusMsg.classList.replace("text-amber-500", "text-red-500");
        
        // Log dragging event
        addIncidentLog(`NODO ${id}: Coordenadas actualizadas por calibración.`);
    })
    .catch(err => {
        console.error("Error updating coords:", err);
        statusMsg.textContent = "ERROR COORDS";
        statusMsg.classList.replace("text-amber-500", "text-red-500");
    });
}

// Load and parse intersection statuses
function loadDashboardData() {
    fetch("/api/intersecciones")
        .then(res => {
            if (!res.ok) throw new Error("Network error");
            return res.json();
        })
        .then(data => {
            updateLiveIndicator(true);
            renderMapElements(data);
            updateKPIsPanel(data);
        })
        .catch(err => {
            console.error("Error fetching intersections:", err);
            updateLiveIndicator(false);
        });
}

function updateLiveIndicator(connected) {
    const textEl = document.getElementById("live-indicator-text");
    if (textEl) {
        if (connected) {
            textEl.textContent = "EN VIVO";
            textEl.previousElementSibling.className = "pulse-dot bg-red-500";
        } else {
            textEl.textContent = "DESCONECTADO";
            textEl.previousElementSibling.className = "pulse-dot bg-gray-500";
        }
    }
}

// Render markers and polyline
function renderMapElements(intersections) {
    // 1. Draw/Update Markers
    intersections.forEach(node => {
        const { id, name, lat, lng, status, count } = node;
        
        if (!mapMarkers[id]) {
            // Create new marker
            const marker = L.marker([lat, lng], {
                draggable: true,
                icon: getMarkerIcon(status)
            });
            
            // Bind tooltips
            marker.bindTooltip(`<strong>${id}</strong>: ${name}<br>Conteo: ${count} veh`, {
                direction: "top",
                offset: [0, -12]
            });
            
            // Bind double click / click to navigate
            marker.on('click', () => {
                window.location.href = `/interseccion/${id}`;
            });
            
            // Bind dragend coordinate saver
            marker.on('dragend', (e) => {
                const updatedLatLng = e.target.getLatLng();
                updateIntersectionCoords(id, updatedLatLng.lat, updatedLatLng.lng);
            });
            
            marker.addTo(map);
            mapMarkers[id] = marker;
        } else {
            // Update existing marker
            const marker = mapMarkers[id];
            
            // Only update position if it's not being dragged (Leaflet handles drag visually)
            marker.setLatLng([lat, lng]);
            marker.setIcon(getMarkerIcon(status));
            marker.setTooltipContent(`<strong>${id}</strong>: ${name}<br>Conteo: ${count} veh`);
        }
    });

    // 2. Draw/Update polyline for Av. Javier Prado
    // Filter Javier Prado nodes and sort by longitude (West to East) to draw connecting lines
    const jpNodes = intersections
        .filter(n => n.corridor === "Av. Javier Prado")
        .sort((a, b) => a.lng - b.lng);
        
    const jpCoords = jpNodes.map(n => [n.lat, n.lng]);
    
    if (jpCoords.length > 1) {
        if (!corridorPolyline) {
            corridorPolyline = L.polyline(jpCoords, {
                color: '#21A179',
                weight: 5,
                opacity: 0.65,
                dashArray: '8, 12',
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            
            corridorPolyline.bindTooltip("Onda Verde - Corredor Javier Prado (Coordinado)", {
                sticky: true,
                className: "corridor-tooltip"
            });
        } else {
            corridorPolyline.setLatLngs(jpCoords);
        }
    }
}

// Calculate and render KPIs on the right panel
function updateKPIsPanel(intersections) {
    let verdeCount = 0;
    let ambarCount = 0;
    let rojoCount = 0;
    let totalVehicles = 0;
    let totalWaitTime = 0;
    
    // Sort and update alerts logs
    intersections.forEach(node => {
        totalVehicles += node.count;
        totalWaitTime += node.count * 5; // wait time factor
        
        if (node.status === "VERDE") verdeCount++;
        else if (node.status === "AMARILLO") ambarCount++;
        else if (node.status === "ROJO") rojoCount++;
    });
    
    // Update breakdown numbers
    document.getElementById("status-verde-count").textContent = verdeCount;
    document.getElementById("status-ambar-count").textContent = ambarCount;
    document.getElementById("status-rojo-count").textContent = rojoCount;
    document.getElementById("nodes-count").textContent = `${intersections.length} Intersecciones`;

    // Global KPIs calculations
    const avgWait = totalWaitTime / intersections.length;
    // Congestion %: sum count / max possible count in demo (e.g. 50 cars overall)
    const congestionPct = Math.min(100, Math.round((totalVehicles / 45) * 100));
    
    document.getElementById("district-congestion-pct").textContent = `${congestionPct}%`;
    document.getElementById("district-wait-time").textContent = `${avgWait.toFixed(1)}s`;
    document.getElementById("district-total-vehicles").textContent = totalVehicles;

    // Green Wave Corridor Progress
    // Count how many Javier Prado intersections are not RED (VERDE or AMARILLO)
    const jpNodes = intersections.filter(n => n.corridor === "Av. Javier Prado");
    const synchronizedJpNodes = jpNodes.filter(n => n.status !== "ROJO").length;
    
    document.getElementById("sync-counter").textContent = `${synchronizedJpNodes}/${jpNodes.length}`;
    const syncPct = (synchronizedJpNodes / jpNodes.length) * 100;
    document.getElementById("sync-progress-bar").style.width = `${syncPct}%`;

    // TOP 3 Congestionated Nodes
    const top3 = [...intersections]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
        
    const rankingContainer = document.getElementById("ranking-list");
    rankingContainer.innerHTML = "";
    
    top3.forEach((node, idx) => {
        let statusBadge = "bg-emerald-500";
        if (node.status === "AMARILLO") statusBadge = "bg-amber-500";
        else if (node.status === "ROJO") statusBadge = "bg-red-500 animate-pulse";
        
        const row = document.createElement("div");
        row.className = "flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-white/5 hover:border-white/10 transition cursor-pointer";
        row.onclick = () => { window.location.href = `/interseccion/${node.id}`; };
        row.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="font-bold text-slate-400">#${idx + 1}</span>
                <span class="font-bold text-slate-300">${node.id}</span>
                <span class="text-slate-300 truncate max-w-[170px]">${node.name.replace("Av. Javier Prado x ", "")}</span>
            </div>
            <div class="flex items-center space-x-2">
                <span class="font-semibold text-white bg-slate-800 px-2 py-0.5 rounded text-[10px]">${node.count} veh</span>
                <span class="w-2.5 h-2.5 rounded-full ${statusBadge}"></span>
            </div>
        `;
        rankingContainer.appendChild(row);
    });

    // Generate simulated alerts feed
    generateAlerts(intersections);

    // Update Sparkline wait time history
    waitTimeHistory.push(avgWait);
    if (waitTimeHistory.length > 20) {
        waitTimeHistory.shift();
    }
    drawSparkline(waitTimeHistory);
}

// Generate alerts when status is ROJO or transitions occur
function generateAlerts(intersections) {
    const activeRojoNodes = intersections.filter(n => n.status === "ROJO");
    
    // Periodically, if there are Red nodes, push alert logs if not present
    activeRojoNodes.forEach(node => {
        const exists = incidentEvents.some(e => e.includes(node.id) && e.includes("congestión"));
        if (!exists) {
            const extraSec = 10 + (node.count - 5) * 4;
            const logMsg = `🔴 ${node.id} (${node.name.split("x")[1]?.trim() || "Cruce"}): Congestión de ${node.count} veh. Semáforo VERDE extendido +${extraSec}s.`;
            addIncidentLog(logMsg);
        }
    });

    // Maintain basic simulated flow logs if no incidents to show
    if (incidentEvents.length === 0) {
        addIncidentLog("🟢 Red SmartCross operativa. Nodos sincronizados correctamente.");
    }
}

function addIncidentLog(msg) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logItem = `[${timeStr}] ${msg}`;
    
    // Add to top of array
    incidentEvents.unshift(logItem);
    
    // Keep max 8 events
    if (incidentEvents.length > 8) {
        incidentEvents.pop();
    }
    
    // Render feed
    const container = document.getElementById("alert-feed");
    container.innerHTML = "";
    
    incidentEvents.forEach(evt => {
        const item = document.createElement("div");
        item.className = "py-1.5 border-b border-white/5 last:border-0 leading-relaxed font-medium text-slate-300";
        // Highlight RED indicators
        if (evt.includes("🔴")) {
            item.innerHTML = evt.replace("🔴", '<span class="text-red-500">🔴</span>');
        } else if (evt.includes("🟢")) {
            item.innerHTML = evt.replace("🟢", '<span class="text-emerald-500">🟢</span>');
        } else {
            item.innerHTML = `<span class="text-amber-500">⚙️</span> ${evt}`;
        }
        container.appendChild(item);
    });
}

// Draw a beautiful custom SVG sparkline path
function drawSparkline(history) {
    const svg = document.getElementById("trend-sparkline");
    const path = document.getElementById("sparkline-path");
    if (!svg || !path) return;
    
    const width = 100;
    const height = 30;
    
    const minVal = Math.min(...history) - 1;
    const maxVal = Math.max(...history) + 1;
    const valRange = maxVal - minVal || 1;
    
    const points = history.map((val, idx) => {
        const x = (idx / (history.length - 1)) * width;
        // Invert Y because SVG coordinates start from top-left (0,0)
        const y = height - ((val - minVal) / valRange) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    
    path.setAttribute("d", "M " + points.join(" L "));
}
