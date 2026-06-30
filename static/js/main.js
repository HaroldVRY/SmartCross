document.addEventListener("DOMContentLoaded", () => {
    // Start clock updater
    updateClock();
    setInterval(updateClock, 1000);

    // Initial API poll and start interval
    pollStatus();
    setInterval(pollStatus, 500); // Poll every 500ms for responsiveness

    // Video selector (Modulo 1)
    loadVideoSelector();
});

// Build the Video 1 / Video 2 selector buttons from /api/videos and wire clicks
function loadVideoSelector() {
    const container = document.getElementById("video-selector-buttons");
    if (!container) return;

    fetch("/api/videos")
        .then(res => res.json())
        .then(data => {
            container.innerHTML = "";
            data.available.forEach(videoKey => {
                const btn = document.createElement("button");
                const isActive = videoKey === data.current;
                btn.textContent = videoKey.replace("video", "Video ");
                btn.className = isActive
                    ? "text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white"
                    : "text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-600";
                btn.onclick = () => selectVideo(videoKey);
                container.appendChild(btn);
            });
        })
        .catch(err => console.error("Error cargando selector de video:", err));
}

function selectVideo(videoKey) {
    fetch("/api/select_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: videoKey })
    })
        .then(res => res.json())
        .then(() => loadVideoSelector())
        .catch(err => console.error("Error seleccionando video:", err));
}

// Update the header clock
function updateClock() {
    const clockEl = document.getElementById("header-clock");
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    }
}

// Poll status API
function pollStatus() {
    const id = window.INTERSECTION_ID || 'INT-01';
    fetch("/api/status?id=" + id)
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then(data => {
            updateDashboard(data);
        })
        .catch(error => {
            console.error("Error fetching status:", error);
            // Show disconnected badge status
            const liveBadge = document.getElementById("live-indicator-text");
            if (liveBadge) {
                liveBadge.textContent = "DESCONECTADO";
                liveBadge.previousElementSibling.classList.replace("bg-red-500", "bg-gray-500");
            }
        });
}

// Update UI elements based on API status
function updateDashboard(data) {
    // Update live badge text
    const liveBadge = document.getElementById("live-indicator-text");
    if (liveBadge) {
        liveBadge.textContent = "EN VIVO";
        if (liveBadge.previousElementSibling.classList.contains("bg-gray-500")) {
            liveBadge.previousElementSibling.classList.replace("bg-gray-500", "bg-red-500");
        }
    }

    // Update global KPIs
    document.getElementById("kpi-total-vehicles").textContent = data.kpis.total_vehicles;
    document.getElementById("kpi-pct-red").textContent = `${data.kpis.pct_red}%`;
    document.getElementById("kpi-avg-wait").textContent = `${data.kpis.avg_wait.toFixed(1)}s`;
    
    const congestionEl = document.getElementById("kpi-congestion-level");
    congestionEl.textContent = data.kpis.congestion_level;
    // Set color based on level
    congestionEl.className = "text-2xl font-bold transition-colors duration-300";
    if (data.kpis.congestion_level === "CRÍTICO") {
        congestionEl.classList.add("text-red-500");
    } else if (data.kpis.congestion_level === "MODERADO") {
        congestionEl.classList.add("text-amber-500");
    } else {
        congestionEl.classList.add("text-emerald-500");
    }

    // Update individual cards
    const lights = data.lights;
    for (const [id, light] of Object.entries(lights)) {
        updateLightCard(id, light);
    }
}

// Helper to update a traffic light card
function updateLightCard(id, light) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;

    // 1. Update Card Border / Glow depending on status
    card.className = "card-glass rounded-xl p-4 transition-all duration-300 ";
    if (light.status === "ROJO") {
        card.classList.add("card-alert-red");
    } else if (light.status === "AMARILLO") {
        card.classList.add("card-alert-amber");
    } else {
        card.classList.add("card-alert-green");
    }

    // 2. Update count
    const countEl = document.getElementById(`count-${id}`);
    if (countEl) {
        countEl.textContent = light.count.toFixed(0); // Display integer-like counts
    }

    // 3. Update active sphere color (Verde/Amarillo/Rojo)
    const activeSphere = document.getElementById(`sphere-active-${id}`);
    if (activeSphere) {
        activeSphere.className = "light-sphere ";
        if (light.status === "ROJO") {
            activeSphere.classList.add("light-red");
        } else if (light.status === "AMARILLO") {
            activeSphere.classList.add("light-amber");
        } else {
            activeSphere.classList.add("light-green");
        }
    }

    // 4. Update wait time
    const waitEl = document.getElementById(`wait-${id}`);
    if (waitEl) {
        waitEl.textContent = `${light.wait_time}s`;
    }

    // 5. Update green duration recommendation
    const greenRecEl = document.getElementById(`green-rec-${id}`);
    if (greenRecEl) {
        if (light.status === "ROJO") {
            greenRecEl.textContent = `+${light.recommended_extra_green}s verde`;
            greenRecEl.classList.replace("text-slate-400", "text-emerald-400");
            greenRecEl.parentElement.classList.remove("hidden");
        } else if (light.status === "AMARILLO") {
            greenRecEl.textContent = `Normal`;
            greenRecEl.classList.replace("text-emerald-400", "text-slate-400");
            greenRecEl.parentElement.classList.remove("hidden");
        } else {
            greenRecEl.parentElement.classList.add("hidden");
        }
    }

    // 6. Update Algorithm Action block (only visible if ROJO)
    const actionBlock = document.getElementById(`action-block-${id}`);
    const actionText = document.getElementById(`action-text-${id}`);
    if (actionBlock && actionText) {
        if (light.status === "ROJO") {
            actionText.textContent = light.action;
            actionBlock.classList.remove("hidden");
        } else {
            actionBlock.classList.add("hidden");
            actionText.textContent = "";
        }
    }
}
