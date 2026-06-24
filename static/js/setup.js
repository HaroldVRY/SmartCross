let currentLight = "S1";
let allRois = {
    "S1": [],
    "S2": [],
    "S3": [],
    "S4": []
};

let canvas, ctx, img;
const colors = {
    "S1": "rgba(33, 161, 121, 0.8)",   // Green
    "S2": "rgba(244, 196, 48, 0.8)",   // Amber
    "S3": "rgba(226, 59, 59, 0.8)",    // Red
    "S4": "rgba(59, 130, 246, 0.8)"    // Blue
};
const fillColors = {
    "S1": "rgba(33, 161, 121, 0.15)",
    "S2": "rgba(244, 196, 48, 0.15)",
    "S3": "rgba(226, 59, 59, 0.15)",
    "S4": "rgba(59, 130, 246, 0.15)"
};

document.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("roi-canvas");
    ctx = canvas.getContext("2d");
    img = new Image();

    // Set canvas source image (static frame from video)
    img.src = "/api/get_frame?t=" + new Date().getTime(); // cache bust
    img.onload = () => {
        // Adjust canvas dimension to match aspect ratio of image or container
        canvas.width = img.naturalWidth || 960;
        canvas.height = img.naturalHeight || 540;
        
        // Initial fetch of existing ROIs from server
        fetchRois();
    };

    // Add select handler
    const selector = document.getElementById("light-selector");
    if (selector) {
        selector.addEventListener("change", (e) => {
            currentLight = e.target.value;
            drawEverything();
        });
    }

    // Canvas click event to add coordinates
    canvas.addEventListener("click", handleCanvasClick);
});

// Fetch ROIs from Flask backend
function fetchRois() {
    fetch("/api/get_rois")
        .then(res => res.json())
        .then(data => {
            allRois = data;
            drawEverything();
        })
        .catch(err => console.error("Error fetching ROIs:", err));
}

// Draw backdrop image, drawn polygons, and active polygon in progress
function drawEverything() {
    if (!ctx || !img) return;

    // 1. Draw frame image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 2. Draw all saved polygons (semi-transparent)
    for (const [id, points] of Object.entries(allRois)) {
        if (!points || points.length === 0) continue;
        
        // Set stroke color based on S1/S2/S3/S4
        ctx.strokeStyle = colors[id];
        ctx.fillStyle = fillColors[id];
        ctx.lineWidth = id === currentLight ? 4 : 2;

        ctx.beginPath();
        points.forEach((pt, idx) => {
            const x = pt[0] * canvas.width;
            const y = pt[1] * canvas.height;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        if (points.length > 2) {
            ctx.closePath();
        }
        ctx.stroke();
        ctx.fill();

        // Draw points with small circles for current active light
        if (id === currentLight) {
            points.forEach((pt) => {
                const x = pt[0] * canvas.width;
                const y = pt[1] * canvas.height;
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = colors[id];
                ctx.stroke();
            });
        }

        // Draw label in center/first point
        if (points.length > 0) {
            const firstPt = points[0];
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 16px Poppins, sans-serif";
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 4;
            ctx.fillText(id, firstPt[0] * canvas.width + 10, firstPt[1] * canvas.height + 20);
            ctx.shadowBlur = 0; // reset
        }
    }
}

// Add click point
function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to relative coordinates (0.0 to 1.0)
    const relX = x / rect.width;
    const relY = y / rect.height;

    // Append to current light array
    if (!allRois[currentLight]) {
        allRois[currentLight] = [];
    }
    
    allRois[currentLight].push([relX, relY]);
    drawEverything();
}

// Clear active ROI
function clearActiveRoi() {
    allRois[currentLight] = [];
    drawEverything();
}

// Save ROIs to Flask backend
function saveRois() {
    const statusMsg = document.getElementById("status-message");
    statusMsg.textContent = "Guardando...";
    statusMsg.className = "text-amber-400 font-medium";

    fetch("/api/save_rois", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(allRois)
    })
    .then(res => {
        if (!res.ok) throw new Error("Network response error");
        return res.json();
    })
    .then(data => {
        statusMsg.textContent = "¡Configuración guardada con éxito!";
        statusMsg.className = "text-emerald-400 font-medium";
        setTimeout(() => {
            statusMsg.textContent = "";
        }, 3000);
    })
    .catch(err => {
        console.error("Error saving ROIs:", err);
        statusMsg.textContent = "Error al guardar. Inténtalo de nuevo.";
        statusMsg.className = "text-red-500 font-medium";
    });
}
