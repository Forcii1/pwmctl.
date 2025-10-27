const curvesContainer = document.getElementById('curvesContainer');
const addCurveBtn = document.getElementById('addCurveBtn');
let curveIdCounter = 1;

window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('buttonsContainer');
    if (!container) return console.error("buttonsContainer not found!");

    async function createFanButtons(name1, name2, displayName) {
        container.innerHTML = '';

        // --- HWMon Pfad ---
        const hwmonPath = await window.electronAPI.searchPath(name1, name2);
        if (hwmonPath === "NONE") {
            container.textContent = `Kein HWMon-Gerät für ${displayName} gefunden!`;
            return;
        }

        // --- GPU Fan Pfad ---
        let gpuFanFile = null;
        let isNvidia = false;
        const gpupath = await window.electronAPI.searchPath("amdgpu"); // HWMon GPU
        if (gpupath !== "NONE") {
            gpuFanFile = gpupath + "/fan1_target"; // HWMon-style
        } else {
            isNvidia = true; // NVIDIA über Script (%)
            gpuFanFile = "NVIDIA GPU";
        }

        const count = await window.electronAPI.getFanCount(hwmonPath);

        // --- HWMon Fans ---
        for (let i = 1; i <= count; i++) {
            const fanFile = `${hwmonPath}/fan${i}_input`;
            createFanUI(container, `Fan ${i}`, fanFile, true, false); // PWM aktiv, nicht NVIDIA
        }

        // --- GPU Fan ---
        createFanUI(container, "GPU Fan", gpuFanFile, true, isNvidia);
    }

    function createFanUI(container, fanName, fanFile, showPWM, isNvidia) {
        const fanContainer = document.createElement('div');
        fanContainer.classList.add('container');

        const header = document.createElement('div');
        header.classList.add('fan-header');

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('fan-name-span');
        nameSpan.textContent = fanName;
        nameSpan.style.cursor = 'pointer';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.classList.add('fan-name-input');
        nameInput.value = fanName;
        nameInput.style.display = 'none';

        nameSpan.addEventListener('click', () => {
            nameSpan.style.display = 'none';
            nameInput.style.display = 'inline-block';
            nameInput.focus();
            nameInput.select();
        });

        nameInput.addEventListener('blur', () => {
            const newName = nameInput.value.trim() || nameSpan.textContent;
            nameSpan.textContent = newName;
            nameSpan.style.display = 'inline';
            nameInput.style.display = 'none';
        });

        const speedLabel = document.createElement('span');
        speedLabel.classList.add('fan-rpm');
        speedLabel.textContent = '--- ' + (isNvidia ? '%' : 'RPM');

        header.appendChild(nameSpan);
        header.appendChild(nameInput);
        header.appendChild(speedLabel);
        fanContainer.appendChild(header);

        // ---- PWM + Slider (auch für NVIDIA) ----
        if (showPWM) {
            const content = document.createElement('div');
            content.classList.add('content');
            content.style.overflow = 'visible';
            content.style.maxHeight = 'none';

            const inputContainer = document.createElement('div');
            inputContainer.style.marginTop = '10px';
            inputContainer.style.display = 'flex';
            inputContainer.style.flexDirection = 'column';
            inputContainer.style.gap = '8px';

            const pwmLabel = document.createElement('label');
            pwmLabel.textContent = 'Control ';
            const pwmCheckbox = document.createElement('input');
            pwmCheckbox.type = 'checkbox';
            const pwmvalLabel = document.createElement('label');
            pwmvalLabel.textContent = 'PWM value ';
            const pwmInput = document.createElement('input');
            pwmInput.type = 'range';
            pwmInput.min = '0';
            pwmInput.max = '255';
            if(isNvidia){
                pwmInput.max = '100';
            }
            pwmInput.value = '0';
            const pwmValueLabel = document.createElement('span');
            pwmValueLabel.textContent = pwmInput.value;

            pwmInput.disabled = !pwmCheckbox.checked;
            pwmInput.style.opacity = pwmCheckbox.checked ? '1' : '0.5';

            pwmCheckbox.addEventListener('change', () => {
                pwmInput.disabled = !pwmCheckbox.checked;
                pwmInput.style.opacity = pwmCheckbox.checked ? '1' : '0.5';
            });

            pwmInput.addEventListener('input', () => {
                if (pwmCheckbox.checked) pwmValueLabel.textContent = pwmInput.value;
            });

            [pwmLabel, pwmCheckbox, pwmvalLabel, pwmInput, pwmValueLabel].forEach(el => inputContainer.appendChild(el));
            content.appendChild(inputContainer);
            fanContainer.appendChild(content);
        }

        container.appendChild(fanContainer);

        // ---- Aktualisierung (RPM oder %) ----
        async function updateSpeed() {
            try {
                let speed = 0;
                if (isNvidia && fanFile === "NVIDIA GPU") {
                    speed = await window.electronAPI.getNvidiaFan(); // Script liefert %
                } else {
                    speed = await window.electronAPI.getFanSpeed(fanFile); // HWMon
                }
                speedLabel.textContent = speed + (isNvidia ? '%' : ' RPM');
            } catch {
                speedLabel.textContent = '--- ' + (isNvidia ? '%' : 'RPM');
            }
        }
        updateSpeed();
        setInterval(updateSpeed, 1000);
    }

    createFanButtons("it87", "it86", "Fans");
});



// Curves nebeneinander
curvesContainer.style.display = 'flex';
curvesContainer.style.flexWrap = 'wrap';
curvesContainer.style.gap = '10px';
curvesContainer.style.alignItems = 'flex-start';
curvesContainer.style.justifyContent = 'flex-start';

// Mini-Graph zeichnen
// Mini-Graph zeichnen (HiDPI-fähig)
function drawMiniCurve(canvas, points) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;

    // Canvas für HiDPI skalieren
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Achsen
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height); // X-Achse
    ctx.lineTo(width, height);
    ctx.moveTo(0, 0);      // Y-Achse
    ctx.lineTo(0, height);
    ctx.stroke();

    if (points.length === 0) return;

    // Kurve
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x / 100 * width, height - points[0].y / 255 * height);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x / 100 * width, height - points[i].y / 255 * height);
    }
    ctx.stroke();

    // Punkte
    points.forEach(p => {
        ctx.fillStyle = '#00bcd4';
        ctx.beginPath();
        ctx.arc(p.x / 100 * width, height - p.y / 255 * height, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}


// Großer Editor
function openCurveEditor(points, miniCanvas, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'curve-editor-overlay'; // CSS Klasse

    const editorContainer = document.createElement('div');
    editorContainer.className = 'curve-editor-container';
    overlay.appendChild(editorContainer);

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    canvas.className = 'curve-editor-canvas';
    editorContainer.appendChild(canvas);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.className = 'curve-editor-close';
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
    editorContainer.appendChild(closeBtn);

    document.body.appendChild(overlay);
    const ctx = canvas.getContext('2d');

    if (!points.find(p => p.x === 0)) points.unshift({ x: 0, y: 0 });


    function drawCurve() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Achsen
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(50, canvas.height - 40);
        ctx.lineTo(canvas.width - 20, canvas.height - 40);
        ctx.moveTo(50, 20);
        ctx.lineTo(50, canvas.height - 40);
        ctx.stroke();

        // Rasterlinien X (Temp) alle 10
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        for(let t=10;t<=100;t+=10){
            const x = 50 + t/100*(canvas.width-70);
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, canvas.height - 40);
            ctx.stroke();
        }

        // Rasterlinien Y (PWM) alle 10
        for(let p=0;p<=255;p+=25){ // 255/10≈25
            const y = canvas.height - 40 - p/255*(canvas.height-60);
            ctx.beginPath();
            ctx.moveTo(50, y);
            ctx.lineTo(canvas.width-20, y);
            ctx.stroke();
        }

        // Achsenbeschriftung
        ctx.fillStyle = '#ccc';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Temp (0-100°C)', canvas.width / 2, canvas.height - 10);
        ctx.save();
        ctx.translate(15, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('PWM (0-255)', 0, 0);
        ctx.restore();

        if(points.length < 2) return;

        // Kurve
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50 + points[0].x / 100 * (canvas.width - 70), canvas.height - 40 - points[0].y / 255 * (canvas.height - 60));
        for(let i=1;i<points.length;i++){
            ctx.lineTo(50 + points[i].x / 100 * (canvas.width - 70), canvas.height - 40 - points[i].y / 255 * (canvas.height - 60));
        }
        ctx.stroke();

        // Punkte
        points.forEach(p=>{
            ctx.fillStyle = '#00bcd4';
            ctx.beginPath();
            ctx.arc(50 + p.x / 100 * (canvas.width - 70), canvas.height - 40 - p.y / 255 * (canvas.height - 60), 5, 0, 2*Math.PI);
            ctx.fill();
        });
    }

    drawCurve();
    let selectedPoint = null;

    const coordDisplay = document.createElement('div');
    coordDisplay.className = 'curve-editor-coord';
    editorContainer.appendChild(coordDisplay);

    canvas.addEventListener('mousedown', e => {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        let y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        x = Math.min(Math.max(x, 0), 100);
        y = Math.min(Math.max(y, 0), 255);

        if(e.button === 0){ // Linksklick
            selectedPoint = points.find(p => Math.hypot(p.x - x, p.y - y) < 3);
            
            if(!selectedPoint){
                // Monotone Kurve prüfen
                const prev = points.filter(p => p.x <= x).pop();
                if(prev){
                    x = Math.max(x, prev.x);
                    y = Math.max(y, prev.y);
                }
                const next = points.find(p => p.x >= x);
                if(next){
                    x = Math.min(x, next.x);
                    y = Math.min(y, next.y);
                }

                points.push({ x, y });
                points.sort((a,b) => a.x - b.x);

                // **Koordinatenanzeige sofort setzen**
                coordDisplay.textContent = `Temp: ${x.toFixed(0)}°C | PWM: ${y.toFixed(0)}`;
                
                drawCurve();
                drawMiniCurve(miniCanvas, points);
            } else {
                // Punkt bereits vorhanden, sofort Anzeige aktualisieren
                coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
            }
        }
    });


    canvas.addEventListener('mousemove', e => {
        if (!selectedPoint) return;

        const rect = canvas.getBoundingClientRect();
        let newX = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        let newY = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        // Ersten Punkt: x fix, y darf bewegt werden
        if (selectedPoint.x === 0) {
            newX = 0;
            newY = Math.min(Math.max(newY, 0), 255);
            selectedPoint.y = newY;
        } else {
            const idx = points.indexOf(selectedPoint);
            if (idx > 0) {
                const prev = points[idx - 1];
                newX = Math.max(newX, prev.x);
                newY = Math.max(newY, prev.y);
            }
            if (idx < points.length - 1) {
                const next = points[idx + 1];
                newX = Math.min(newX, next.x);
                newY = Math.min(newY, next.y);
            }
            selectedPoint.x = Math.min(Math.max(newX, 0), 100);
            selectedPoint.y = Math.min(Math.max(newY, 0), 255);
        }

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
        
        drawCurve();
        drawMiniCurve(miniCanvas, points); 
    });


    // Punkt löschen mit Rechtsklick
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        const y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        const pointIndex = points.findIndex(p => p.x !== 0 && Math.hypot(p.x - x, p.y - y) < 3);
        if(pointIndex !== -1){
            points.splice(pointIndex,1);
            drawCurve();
            drawMiniCurve(miniCanvas, points);
        }
    });

    canvas.addEventListener('mouseup', () => selectedPoint = null);

    canvas.addEventListener('dblclick', () => {
        onSave(points);
        document.body.removeChild(overlay);
    });
}


addCurveBtn.addEventListener('click', () => {
    const curveContainer = document.createElement('div');
    curveContainer.className = 'curve-container';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'curve-left';

    // Titel
    const title = document.createElement('span');
    const curveId = curveIdCounter++;
    title.textContent = `Curve ${curveId}`;
    title.className = 'curve-title';
    title.style.cursor = 'pointer'; // klickbar
    curveContainer.dataset.id = curveId;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'curve-title-input';
    titleInput.value = title.textContent;
    titleInput.style.display = 'none';

    // Klick auf Titel -> editieren
    title.addEventListener('click', () => {
        title.style.display = 'none';
        titleInput.style.display = 'inline-block';
        titleInput.focus();
        titleInput.select();
    });

    titleInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') titleInput.blur();
        else if (ev.key === 'Escape') {
            titleInput.value = title.textContent;
            titleInput.blur();
        }
        ev.stopPropagation();
    });

    titleInput.addEventListener('blur', () => {
        const newName = titleInput.value.trim() || title.textContent;
        title.textContent = newName;
        title.style.display = 'inline';
        titleInput.style.display = 'none';
    });

    leftGroup.appendChild(title);
    leftGroup.appendChild(titleInput);

    // --- Fans ---
    const fanContainer = document.createElement('div');
    fanContainer.className = 'curve-fans';

    const fanHeaders = document.querySelectorAll('#buttonsContainer .container .fan-header');
    const selectedFans = new Set();

    fanHeaders.forEach((fan, idx) => {
        const nameInput = fan.querySelector('input[type="text"]');
        const btn = document.createElement('button');
        btn.textContent = nameInput ? nameInput.value : `Fan ${idx + 1}`;
        btn.className = 'curve-fan-btn';
        btn.addEventListener('click', () => {
            if (selectedFans.has(idx + 1)) {
                selectedFans.delete(idx + 1);
                btn.classList.remove('selected');
            } else {
                selectedFans.add(idx + 1);
                btn.classList.add('selected');
            }
        });
        fanContainer.appendChild(btn);
    });

    leftGroup.appendChild(fanContainer);

    // --- Sensoren & Action Buttons ---
    const rightGroup = document.createElement('div');
    rightGroup.className = 'curve-right';

    const sensors = ['CPU', 'GPU', 'Higher'];
    let selectedSensor = sensors[0];

    sensors.forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s;
        btn.className = 'curve-sensor-btn';
        if (s === selectedSensor) btn.classList.add('selected');
        btn.addEventListener('click', () => {
            selectedSensor = s;
            Array.from(rightGroup.querySelectorAll('.curve-sensor-btn'))
                .forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected');
        });
        rightGroup.appendChild(btn);
    });

    const actionBtnContainer = document.createElement('div');
    actionBtnContainer.style.display = 'flex';
    actionBtnContainer.style.gap = '4px';
    actionBtnContainer.style.marginTop = '4px';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.className = 'curve-action-btn';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.className = 'curve-action-btn';
    deleteBtn.addEventListener('click', () => curvesContainer.removeChild(curveContainer));

    actionBtnContainer.appendChild(editBtn);
    actionBtnContainer.appendChild(deleteBtn);
    rightGroup.appendChild(actionBtnContainer);

    header.appendChild(leftGroup);
    header.appendChild(rightGroup);

    // --- Mini-Canvas ---
    const miniCanvas = document.createElement('canvas');
    miniCanvas.className = 'curve-mini-canvas';
    miniCanvas.width = 200;
    miniCanvas.height = 100;

    curveContainer.appendChild(header);
    curveContainer.appendChild(miniCanvas);
    curvesContainer.appendChild(curveContainer);

    let curvePoints = [{ x: 0, y: 0 }];
    drawMiniCurve(miniCanvas, curvePoints);

    // Edit-Button öffnet Mini-Editor
    editBtn.addEventListener('click', () => {
        openCurveEditor(curvePoints, miniCanvas, updatedPoints => {
            curvePoints = updatedPoints;
            drawMiniCurve(miniCanvas, curvePoints);
        });

    });
});


