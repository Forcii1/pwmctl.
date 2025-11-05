const curvesContainer = document.getElementById('curvesContainer');
const addCurveBtn = document.getElementById('addCurveBtn');
const applyBtnCurve = document.getElementById('applybtn');
let curveIdCounter = 1;

// ==================== FAN MANAGEMENT ====================
window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('buttonsContainer');
    if (!container) return console.error("buttonsContainer not found!");

    // ---------------- Fans erstellen ----------------
    async function createFanButtons(name1, name2, displayName, savedData = null) {
        container.innerHTML = '';

        const hwmonPath = await window.electronAPI.searchPath(name1, name2);
        if (hwmonPath === "NONE") {
            container.textContent = `Kein HWMon-Gerät für ${displayName} gefunden!`;
            //return;
        }

        let gpuFanFile = null;
        let isNvidia = false;
        const gpupath = await window.electronAPI.searchPath("amdgpu");
        if (gpupath !== "NONE") {
            gpuFanFile = gpupath + "/fan1_target";
        } else {
            isNvidia = true;
            gpuFanFile = "NVIDIA GPU";
        }

        const count = await window.electronAPI.getFanCount(hwmonPath);

        for (let i = 0; i < count; i++) {
            const fanData = savedData?.Fans?.[i] || null;
            createFanUI(container, `Fan ${i + 1}`, `${hwmonPath}/fan${i + 1}_input`, true, false, fanData);
        }

        const gpuFanData = savedData?.GPUS?.GPU || null;
        createFanUI(container, "GPU Fan", gpuFanFile, true, isNvidia, gpuFanData);
    }

    function createFanUI(container, fanName, fanFile, showPWM, isNvidia, savedData = null) {
        const fanContainer = document.createElement('div');
        fanContainer.classList.add('container');

        const header = document.createElement('div');
        header.classList.add('fan-header');

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('fan-name-span');
        nameSpan.textContent = savedData?.name || fanName;
        nameSpan.style.cursor = 'pointer';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.classList.add('fan-name-input');
        nameInput.value = savedData?.name || fanName;
        nameInput.style.display = 'none';

        nameSpan.addEventListener('click', () => {
            nameSpan.style.display = 'none';
            nameInput.style.display = 'inline-block';
            nameInput.focus();
            nameInput.select();
        });
        nameInput.addEventListener('blur', () => {
            nameSpan.textContent = nameInput.value.trim() || nameSpan.textContent;
            nameSpan.style.display = 'inline';
            nameInput.style.display = 'none';
        });

        const speedLabel = document.createElement('span');
        speedLabel.classList.add('fan-rpm');
        speedLabel.textContent = '--- ' + (isNvidia ? '%' : 'RPM');

        header.append(nameSpan, nameInput, speedLabel);
        fanContainer.appendChild(header);

        if (showPWM) {
            const content = document.createElement('div');
            content.classList.add('content');

            const inputContainer = document.createElement('div');
            inputContainer.style.display = 'flex';
            inputContainer.style.flexDirection = 'column';
            inputContainer.style.gap = '6px';
            inputContainer.style.marginTop = '10px';

            const pwmLabel = document.createElement('label');
            pwmLabel.textContent = 'man. Control';
            const pwmCheckbox = document.createElement('input');
            pwmCheckbox.type = 'checkbox';
            pwmCheckbox.checked = savedData?.enabled || false;

            const pwmvalLabel = document.createElement('label');
            pwmvalLabel.textContent = 'PWM value ';
            const pwmInput = document.createElement('input');
            pwmInput.type = 'range';
            pwmInput.min = '0';
            pwmInput.max = isNvidia ? '100' : '255';
            pwmInput.value = savedData?.value || 0;
            pwmInput.disabled = !pwmCheckbox.checked;
            pwmInput.style.opacity = pwmCheckbox.checked ? '1' : '0.5';


            const curveselect = document.createElement('select');
            curveselect.className="myCurveSelect"
            // 2. Alle Kurven-Container finden
            const curves = document.querySelectorAll('.curve-container');
            const option = new Option("None", -1);
            curveselect.options.add(option);
            
            // 3. Optionen hinzufügen
            curves.forEach(curve => {
                const title = curve.querySelector('.curve-title');
                const id = curve.dataset.id; // die ID aus data-id
                if (title && id !== undefined) {
                    const option = new Option(title.textContent, id); // Text = Name, Value = ID
                    curveselect.options.add(option);
                }
            });
            curveselect.value=savedData?.curve || -1;


            const pwmValueLabel = document.createElement('span');
            pwmValueLabel.textContent = pwmInput.value;

            const applyBtn = document.createElement('button');
            applyBtn.textContent = '✔';
            applyBtn.style.width = '30px';
            applyBtn.style.cursor = 'pointer';

            pwmCheckbox.addEventListener('change', () => {
                pwmInput.disabled = !pwmCheckbox.checked;
                pwmInput.style.opacity = pwmCheckbox.checked ? '1' : '0.5';
            });

            pwmInput.addEventListener('input', () => {
                if (pwmCheckbox.checked) pwmValueLabel.textContent = pwmInput.value;
            });

            applyBtn.addEventListener('click', async () => {
                saveData();
            });

            [pwmLabel,pwmCheckbox,pwmvalLabel, pwmInput, pwmValueLabel,curveselect, applyBtn].forEach(el => inputContainer.appendChild(el));
            content.appendChild(inputContainer);
            fanContainer.appendChild(content);
        }

        container.appendChild(fanContainer);

        async function updateSpeed() {
            try {
                const speed = isNvidia && fanFile === "NVIDIA GPU"
                    ? await window.electronAPI.getNvidiaFan()
                    : await window.electronAPI.getFanSpeed(fanFile);
                speedLabel.textContent = speed + (isNvidia ? '%' : ' RPM');
            } catch {
                speedLabel.textContent = '--- ' + (isNvidia ? '%' : 'RPM');
            }
        }

        updateSpeed();
        setInterval(updateSpeed, 1000);
    }
    // ---------------- Alles laden ----------------

    async function loadCurves(savedData) {
        if (!savedData?.Curves) return;
        Object.entries(savedData.Curves).forEach(([id, curve]) => {
            const { Name, source, temps, pwms, fans } = curve;
            const curveEl = createCurveElement(true,Name, id);
            // Sensor
            const sensorBtns = curveEl.querySelectorAll('.curve-sensor-btn');
            sensorBtns.forEach((btn, idx) => {
                btn.classList.toggle('selected', idx === source);
            });
            // Punkte
            const miniCanvas = curveEl.querySelector('.curve-mini-canvas');
            const points = temps.map((t, i) => ({ x: t, y: pwms[i] }));
            miniCanvas.dataset.points = JSON.stringify(points);
            drawMiniCurve(miniCanvas, points);
            // Fans
            if (fans) {
                curveEl.querySelectorAll('.curve-fan-btn').forEach((btn, idx) => {
                    if (fans.includes(idx)) btn.classList.add('selected');
                });
            }
        });
    }

    const savedData = await window.electronAPI.loadAllData();
    await loadCurves(savedData);
    //loadData();
    await createFanButtons("it87", "it86", "Fans", savedData);
    
});


// ==================== CURVE MANAGEMENT ====================
curvesContainer.style.display = 'flex';
curvesContainer.style.flexWrap = 'wrap';
curvesContainer.style.gap = '10px';
curvesContainer.style.alignItems = 'flex-start';

function drawMiniCurve(canvas, points) {
    if (!points && canvas?.dataset?.points) {
        try { points = JSON.parse(canvas.dataset.points); } catch { points = [{ x: 0, y: 0 }]; }
    }
    points = points || [{ x: 0, y: 0 }];

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x / 100 * width, height - points[0].y / 255 * height);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x / 100 * width, height - points[i].y / 255 * height);
    }
    ctx.stroke();

    points.forEach(p => {
        ctx.fillStyle = '#00bcd4';
        ctx.beginPath();
        ctx.arc(p.x / 100 * width, height - p.y / 255 * height, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function openCurveEditor(points, miniCanvas, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'curve-editor-overlay';

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
    closeBtn.addEventListener('click', () => {
        // Bei Schließen die Punkte speichern
        miniCanvas.dataset.points = JSON.stringify(points);
        drawMiniCurve(miniCanvas, points);
        if (onSave) onSave(points);
        document.body.removeChild(overlay);
    });
    editorContainer.appendChild(closeBtn);

    document.body.appendChild(overlay);
    const ctx = canvas.getContext('2d');

    // Sicherstellen, dass erster Punkt x=0 ist
    if (!points.find(p => p.x === 0)) points.unshift({ x: 0, y: 0 });

    let selectedPoint = null;

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
        ctx.restore();

        // Rasterlinien X (Temp)
        ctx.save();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#ccc';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        for (let t = 10; t <= 100; t += 10) {
            const x = 50 + t / 100 * (canvas.width - 70);
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, canvas.height - 40);
            ctx.stroke();
            ctx.fillText(t, x - 7, canvas.height - 20);
        }
        ctx.restore();

        // Rasterlinien Y (PWM)
        ctx.save();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#ccc';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        for (let p = 0; p <= 255; p += 25) {
            const y = canvas.height - 40 - p / 255 * (canvas.height - 60);
            ctx.beginPath();
            ctx.moveTo(50, y);
            ctx.lineTo(canvas.width - 20, y);
            ctx.stroke();
            ctx.fillText(p, 45 - 10, y + 4);
        }
        ctx.restore();

        if (points.length < 2) return;

        // Kurve
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50 + points[0].x / 100 * (canvas.width - 70), canvas.height - 40 - points[0].y / 255 * (canvas.height - 60));
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(50 + points[i].x / 100 * (canvas.width - 70), canvas.height - 40 - points[i].y / 255 * (canvas.height - 60));
        }
        ctx.stroke();

        // Punkte
        points.forEach(p => {
            ctx.fillStyle = '#00bcd4';
            ctx.beginPath();
            ctx.arc(50 + p.x / 100 * (canvas.width - 70), canvas.height - 40 - p.y / 255 * (canvas.height - 60), 5, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    drawCurve();

    const coordDisplay = document.createElement('div');
    coordDisplay.className = 'curve-editor-coord';
    editorContainer.appendChild(coordDisplay);

    // --- Mouse Events ---
    canvas.addEventListener('mousedown', e => {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        let y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        x = Math.min(Math.max(x, 0), 100);
        y = Math.min(Math.max(y, 0), 255);

        if(e.button === 0){ // Linksklick
            selectedPoint = points.find(p => Math.hypot(p.x - x, p.y - y) < 4);
            
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

        if (idx === 0) { // erster Punkt nur y
            selectedPoint.y = Math.min(Math.max(newY, 0), 255);
        } else {
            selectedPoint.x = Math.min(Math.max(newX, 0), 100);
            selectedPoint.y = Math.min(Math.max(newY, 0), 255);
        }

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
        drawCurve();
    });

    canvas.addEventListener('mouseup', () => selectedPoint = null);

    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        const y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        const HIT_RADIUS = 10;
        const closest = points.reduce((closestSoFar, p, idx) => {
            const dist = Math.hypot(p.x - x, p.y - y);
            if (dist < HIT_RADIUS && (!closestSoFar || dist < closestSoFar.dist)) {
                return { index: idx, dist };
            }
            return closestSoFar;
        }, null);

        if (closest && closest.index !== 0) {
            points.splice(closest.index, 1);
            drawCurve();
            drawMiniCurve(miniCanvas, points);
        }
    });
}


// --- CURVE ELEMENT ERSTELLEN ---
function createCurveElement(fromdata,name, id = null, points = [{ x: 0, y: 0 }]) {
    const curveContainer = document.createElement('div');
    curveContainer.className = 'curve-container';

    const curves = document.querySelectorAll('.curve-container');
    if(!fromdata){
        if (curves.length > 0) {
            const lastCurve = curves[curves.length - 1];
            id=parseInt(lastCurve.dataset.id)+1;
        } else {
            id=1;
        }
    }
    
    curveContainer.dataset.id = id;
    // Header
    const header = document.createElement('div');
    header.className = 'header';
    const leftGroup = document.createElement('div');
    leftGroup.className = 'curve-left';

    const title = document.createElement('span');
    title.className = 'curve-title';
    title.textContent = fromdata ? name : `${name} ${id}`;
    title.style.cursor = 'pointer';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'curve-title-input';
    titleInput.value = fromdata ? name : `${name} ${id}`;
    titleInput.style.display = 'none';

    title.addEventListener('click', () => {
        title.style.display = 'none';
        titleInput.style.display = 'inline-block';
        titleInput.focus();
        titleInput.select();
    });
    titleInput.addEventListener('blur', () => {
        title.textContent = titleInput.value || title.textContent;
        title.style.display = 'inline';
        titleInput.style.display = 'none';

        //deleteSelect(curveContainer);
        //updateCurveSelect(curveContainer);

        updatename(curveContainer,titleInput.value || title.textContent);
    });
    
    leftGroup.appendChild(title);
    leftGroup.appendChild(titleInput);

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
            Array.from(rightGroup.querySelectorAll('.curve-sensor-btn')).forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected');
        });
        rightGroup.appendChild(btn);
    });

    const actionBtnContainer = document.createElement('div');
    actionBtnContainer.style.display = 'flex';
    actionBtnContainer.style.gap = '4px';
    actionBtnContainer.style.marginTop = '4px';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎'; editBtn.className = 'curve-action-btn';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑'; deleteBtn.className = 'curve-action-btn';
    deleteBtn.addEventListener('click', () => {
        curvesContainer.removeChild(curveContainer);
        deleteSelect(curveContainer);

    });
    actionBtnContainer.appendChild(editBtn); actionBtnContainer.appendChild(deleteBtn);
    rightGroup.appendChild(actionBtnContainer);

    header.appendChild(leftGroup);
    header.appendChild(rightGroup);
    curveContainer.appendChild(header);

    const miniCanvas = document.createElement('canvas');
    miniCanvas.className = 'curve-mini-canvas'; miniCanvas.width = 200; miniCanvas.height = 100;
    miniCanvas.dataset.points = JSON.stringify(points);
    curveContainer.appendChild(miniCanvas);
    curvesContainer.appendChild(curveContainer);
    drawMiniCurve(miniCanvas, points);

    editBtn.addEventListener('click', () => {
        // Punkte aus Mini-Canvas laden
        let loadedPoints = [];
        if (miniCanvas.dataset.points) {
            try {
                loadedPoints = JSON.parse(miniCanvas.dataset.points);
            } catch {
                loadedPoints = [{ x:0, y:0 }];
            }
        }
        openCurveEditor(loadedPoints, miniCanvas, updatedPoints => {
            // Speichere die geänderten Punkte zurück ins Mini-Canvas
            miniCanvas.dataset.points = JSON.stringify(updatedPoints);
            drawMiniCurve(miniCanvas, updatedPoints);
            // Aktualisiere lokale points-Variable
            points = updatedPoints;
        });
    });
    
    return curveContainer;
}

// ==================== CURVE ADD & SAVE ====================
addCurveBtn.addEventListener('click', () => {
    curve=createCurveElement(false,`Curve`);
    updateCurveSelect(curve);
});

applyBtnCurve.addEventListener('click', saveData);

// ==================== STORAGE ====================
function collectAllData() {
    const data = { Fans: {}, GPUS: {}, Curves: {} };

    // --- Fans ---
    const fanContainers = document.querySelectorAll('#buttonsContainer .container');
    fanContainers.forEach((fanContainer, idx) => {
        const nameInput = fanContainer.querySelector('.fan-name-span');
        const fanName = nameInput?.textContent || `Fan${idx}`;

        const pwmInput= fanContainer.querySelector('input[type="range"]');
        const val = parseInt(pwmInput.value, 10);
        const pwmCheckbox = fanContainer.querySelector('input[type="checkbox"]');
        const enabled = pwmCheckbox?.checked ?? false;
        const isGpu = fanContainer.querySelector('.fan-name-span')?.textContent.includes('GPU');
        const curveinput = fanContainer.querySelector('.myCurveSelect');


        const fanData = { name: fanName, enabled, value: val, curve: curveinput.value};
        if (isGpu) data.GPUS[0] = fanData;
        else data.Fans[idx] = fanData;
    });

    // --- Curves ---
    const curveContainers = document.querySelectorAll('.curve-container');
    curveContainers.forEach(curveEl => {
        const Name = curveEl.querySelector('.curve-title')?.textContent ?? "Unnamed Curve";

        // Sensor auswählen
        const sensorBtns = curveEl.querySelectorAll('.curve-sensor-btn');
        let source = 0;
        sensorBtns.forEach((btn, idx) => {
            if (btn.classList.contains('selected')) source = idx;
        });

        // Punkte aus Mini-Canvas
        const miniCanvas = curveEl.querySelector('.curve-mini-canvas');
        let points = [];
        if (miniCanvas?.dataset.points) {
            try { points = JSON.parse(miniCanvas.dataset.points); } catch { points = [{ x: 0, y: 0 }]; }
        }

        // Neue ID vergeben
        data.Curves[curveEl.dataset.id] = {
            Name,
            source,
            temps: points.map(p => Math.round(p.x)),
            pwms: points.map(p => Math.round(p.y)),
        };
    });

    return data;
}


async function saveData() {
    const data = collectAllData();
    await window.electronAPI.saveAllData(data);
}

function updateCurveSelect(curve) {
    const curveselect = document.querySelectorAll('.myCurveSelect')

        curveselect.forEach(curvesselec => {
            curvesselec.options="";
            const title = curve.querySelector('.curve-title');
            const id = curve.dataset.id;
            if (title) {
            curvesselec.options.add(new Option(title.textContent, id));
        }
        });
}

function deleteSelect(curve) {
  const curveselects = document.querySelectorAll('.myCurveSelect');

  curveselects.forEach(curveselect => {
    // Get the title text and id from the curve element
    const title = curve.querySelector('.curve-title');
    const id = curve.dataset.id;

    if (!title || !id) return; // skip if missing

    // Loop through options and remove the one that matches the id or text
    for (let i = 0; i < curveselect.options.length; i++) {
      const opt = curveselect.options[i];
      if (opt.value === id || opt.text === title.textContent) {
        curveselect.remove(i);
        break;
      }
    }
  });
}

function updatename(curve,newname){
    const curveselects = document.querySelectorAll('.myCurveSelect');
    curveselects.forEach(curveselect => {
        // Get the title text and id from the curve element
        const title = curve.querySelector('.curve-title');
        const id = curve.dataset.id;

        if (!title || !id) return; // skip if missing

        // Loop through options and remove the one that matches the id or text
        for (let i = 0; i < curveselect.options.length; i++) {
            const opt = curveselect.options[i];
            if (opt.value === id || opt.text === title.textContent) {
                opt.text =newname;
                break;
            }
        }
    });

}
