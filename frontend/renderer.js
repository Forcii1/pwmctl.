const curvesContainer = document.getElementById('curvesContainer');
const addCurveBtn = document.getElementById('addCurveBtn'); // <--- wichtig
let curveIdCounter = 1;

window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('buttonsContainer');
    if (!container) return console.error("buttonsContainer not found!");

    async function createFanButtons(name1, name2, displayName) {
        const container = document.getElementById('buttonsContainer');
        container.innerHTML = '';

        const path = window.electronAPI.searchPath(name1, name2);
        if (path === "NONE") {
            container.textContent = `Kein HWMon-Gerät für ${displayName} gefunden!`;
            return;
        }

        const count = await window.electronAPI.getFanCount(path);
        const savedNames = JSON.parse(localStorage.getItem('fanNames') || '{}');

        for (let i = 1; i <= count; i++) {
            const fanContainer = document.createElement('div');
            fanContainer.classList.add('container');

            // ---- Header ----
            const header = document.createElement('div');
            header.classList.add('header');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '10px';

            // editierbarer Name
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = savedNames[`fan${i}`] || `Fan ${i}`;
            nameInput.style.background = 'transparent';
            nameInput.style.border = 'none';
            nameInput.style.color = '#fff';
            nameInput.style.fontWeight = 'bold';
            nameInput.style.width = '120px';
            nameInput.style.outline = 'none';

            // Name speichern bei Änderung
            nameInput.addEventListener('change', () => {
                savedNames[`fan${i}`] = nameInput.value;
                localStorage.setItem('fanNames', JSON.stringify(savedNames));
            });

            // RPM-Anzeige
            const speedLabel = document.createElement('span');
            speedLabel.textContent = '--- RPM';
            speedLabel.style.fontSize = '0.8rem';
            speedLabel.style.color = '#00bcd4';

            header.appendChild(nameInput);
            header.appendChild(speedLabel);
            fanContainer.appendChild(header);

            // ---- Inhalt (PWM-Regler usw.) ----
            const content = document.createElement('div');
            content.classList.add('content');
            content.style.maxHeight = '0';
            content.style.overflow = 'hidden';
            content.style.transition = 'max-height 0.3s ease, padding 0.3s ease';
            content.style.padding = '0 10px';

            const inputContainer = document.createElement('div');
            inputContainer.style.marginTop = '10px';
            inputContainer.style.display = 'flex';
            inputContainer.style.flexDirection = 'column';
            inputContainer.style.gap = '8px';

            const pwmCheckbox = document.createElement('input');
            pwmCheckbox.type = 'checkbox';
            pwmCheckbox.id = `pwmEnable${i}`;

            const pwmLabel = document.createElement('label');
            pwmLabel.htmlFor = `pwmEnable${i}`;
            pwmLabel.textContent = 'PWM aktiv';

            const pwmInput = document.createElement('input');
            pwmInput.type = 'range';
            pwmInput.min = '0';
            pwmInput.max = '255';
            pwmInput.value = '0';
            pwmInput.style.width = '100%';

            const pwmValueLabel = document.createElement('span');
            pwmValueLabel.textContent = pwmInput.value;
            pwmValueLabel.style.fontSize = '0.9rem';
            pwmValueLabel.style.color = '#f0f0f0';
            pwmValueLabel.style.textAlign = 'center';

            pwmInput.addEventListener('input', () => {
                pwmValueLabel.textContent = pwmInput.value;
            });

            const applyButton = document.createElement('button');
            applyButton.textContent = '✓';
            applyButton.style.width = '30px';
            applyButton.style.height = '30px';
            applyButton.addEventListener('click', () => {
                console.log(`${nameInput.value} - PWM aktiv: ${pwmCheckbox.checked}, Wert: ${pwmInput.value}`);
            });

            [pwmCheckbox, pwmLabel, pwmInput, pwmValueLabel, applyButton].forEach(el => inputContainer.appendChild(el));
            content.appendChild(inputContainer);
            fanContainer.appendChild(content);
            container.appendChild(fanContainer);

            // ---- Aufklappen ----
            header.addEventListener('click', () => {
                content.style.maxHeight = content.style.maxHeight === '0px' || !content.style.maxHeight
                    ? content.scrollHeight + "px"
                    : "0";
            });

            // ---- Drehzahl-Aktualisierung ----
            const fanFile = `${path}/fan${i}_input`;
            async function updateRPM() {
                try {
                    const rpm = await window.electronAPI.getFanSpeed(fanFile);
                    speedLabel.textContent = `${rpm} RPM`;
                } catch {
                    speedLabel.textContent = '--- RPM';
                }
            }
            updateRPM();
            setInterval(updateRPM, 1000);
        }
    }




    createFanButtons("it87", "it86", "Fans");

    const savedCurves = localStorage.getItem('curvesData');
    if(savedCurves) JSON.parse(savedCurves).forEach(data => createCurveFromData(data));
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
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';

    const editorContainer = document.createElement('div');
    editorContainer.style.position = 'relative';
    overlay.appendChild(editorContainer);

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    canvas.style.background = '#1e1e2f';
    canvas.style.border = '1px solid #00bcd4';
    editorContainer.appendChild(canvas);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '-13px';
    closeBtn.style.right = '-13px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '5px 10px';
    closeBtn.style.fontSize = '1rem';
    closeBtn.style.backgroundColor = '#00bcd4';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '4px';
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
    coordDisplay.style.position = 'absolute';
    coordDisplay.style.top = '10px';
    coordDisplay.style.left = '10px';
    coordDisplay.style.color = '#00bcd4';
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
    curveContainer.style.width = '250px';       
    curveContainer.style.flexShrink = '0';      
    curveContainer.style.boxSizing = 'border-box';
    curveContainer.style.display = 'flex';
    curveContainer.style.flexDirection = 'column'; // Header + Mini-Canvas untereinander
    curveContainer.style.gap = '6px';

    // --- Header ---
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.flexWrap = 'wrap';
    header.style.gap = '6px';

    const title = document.createElement('span');
    const curveId = curveIdCounter++;
    title.textContent = `Curve ${curveId}`;
    curveContainer.dataset.id = curveId;
    title.style.fontWeight = 'bold';
    title.style.fontSize = '0.9rem';
    title.style.color = '#00bcd4';

    // --- Fan-Auswahl ---
    const fanContainer = document.createElement('div');
    fanContainer.style.display = 'flex';
    fanContainer.style.flexWrap = 'wrap';
    fanContainer.style.gap = '3px';
    fanContainer.style.border = '1px solid #00bcd4';
    fanContainer.style.padding = '2px';
    fanContainer.style.borderRadius = '4px';
    fanContainer.style.background = 'rgba(0,188,212,0.1)';
    fanContainer.style.minWidth = '70px';

    const fanHeaders = document.querySelectorAll('#buttonsContainer .container .header');
    const selectedFans = new Set();

    fanHeaders.forEach((fan, idx) => {
        const nameInput = fan.querySelector('input[type="text"]');
        const btn = document.createElement('button');
        btn.textContent = nameInput ? nameInput.value : `Fan ${idx + 1}`;
        btn.style.padding = '1px 4px';
        btn.style.fontSize = '0.7rem';
        btn.style.border = '1px solid #00bcd4';
        btn.style.borderRadius = '4px';
        btn.style.background = 'transparent';
        btn.style.color = '#00bcd4';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
            if (selectedFans.has(idx + 1)) {
                selectedFans.delete(idx + 1);
                btn.style.background = 'transparent';
                btn.style.color = '#00bcd4';
            } else {
                selectedFans.add(idx + 1);
                btn.style.background = '#00bcd4';
                btn.style.color = '#fff';
            }
        });
        fanContainer.appendChild(btn);
    });

    // --- Sensor-Auswahl ---
    const sensors = ['CPU', 'GPU', 'Higher'];
    let selectedSensor = sensors[0];
    const sensorContainer = document.createElement('div');
    sensorContainer.style.display = 'flex';
    sensorContainer.style.gap = '3px';

    sensors.forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s;
        btn.style.padding = '1px 4px';
        btn.style.fontSize = '0.7rem';
        btn.style.border = '1px solid #00bcd4';
        btn.style.borderRadius = '4px';
        btn.style.background = s === selectedSensor ? '#00bcd4' : 'transparent';
        btn.style.color = s === selectedSensor ? '#fff' : '#00bcd4';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
            selectedSensor = s;
            Array.from(sensorContainer.children).forEach(c => {
                c.style.background = 'transparent';
                c.style.color = '#00bcd4';
            });
            btn.style.background = '#00bcd4';
            btn.style.color = '#fff';
        });
        sensorContainer.appendChild(btn);
    });

    // --- Edit + Delete Buttons ---
    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.style.padding = '2px 5px';
    editBtn.style.fontSize = '0.7rem';
    editBtn.style.border = '1px solid #00bcd4';
    editBtn.style.borderRadius = '4px';
    editBtn.style.background = 'transparent';
    editBtn.style.cursor = 'pointer';
    editBtn.style.color = '#00bcd4';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.style.padding = '2px 5px';
    deleteBtn.style.fontSize = '0.7rem';
    deleteBtn.style.border = '1px solid #00bcd4';
    deleteBtn.style.borderRadius = '4px';
    deleteBtn.style.background = 'transparent';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.color = '#00bcd4';
    deleteBtn.addEventListener('click', () => curvesContainer.removeChild(curveContainer));

    // --- Header zusammenbauen ---
    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.flexDirection = 'column';
    leftGroup.style.gap = '4px';
    leftGroup.appendChild(title);
    leftGroup.appendChild(fanContainer);

    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.gap = '4px';
    rightGroup.appendChild(sensorContainer);
    rightGroup.appendChild(editBtn);
    rightGroup.appendChild(deleteBtn);

    header.appendChild(leftGroup);
    header.appendChild(rightGroup);

    // --- Mini-Canvas ---
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = 200;
    miniCanvas.height = 100;
    miniCanvas.style.width = '100%';
    miniCanvas.style.height = 'auto';
    miniCanvas.style.display = 'block';

    curveContainer.appendChild(header);
    curveContainer.appendChild(miniCanvas);
    curvesContainer.appendChild(curveContainer);

    let curvePoints = [{ x: 0, y: 0 }];
    drawMiniCurve(miniCanvas, curvePoints);

    editBtn.addEventListener('click', () => {
        openCurveEditor(curvePoints, miniCanvas, updatedPoints => {
            curvePoints = updatedPoints;
            drawMiniCurve(miniCanvas, curvePoints);
        });
    });
});
