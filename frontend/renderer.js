import { openCurveEditor } from './curveeditor.js';
const { configPath, temperaturePath: cachePath } = await window.electronAPI.getPaths();
const curvesContainer = document.getElementById('curvesContainer');
const addCurveBtn = document.getElementById('addCurveBtn');
const { loadAllData } = window.electronAPI;

// ==================== FAN MANAGEMENT ====================
async function init() {
    console.log(`Configpath: ${configPath}`);
    const savedData = await loadAllData(configPath);
    await loadCurves(savedData);
    await createFanButtons("it87", "it86", "Fans", savedData);
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        init().catch(console.error);
    }, { once: true });
} else {
    init().catch(console.error);
}
// ---------------- Fans erstellen ----------------
async function createFanButtons(name1, name2, displayName, savedData = null) {
    const container = document.getElementById('buttonsContainer');
    if (!container) return console.error("buttonsContainer not found!");


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

    const count = await getFanCount();
    for (let i = 1; i <= count; i++) {
        const fanData = savedData?.Fans?.[i] || null;
        createFanUI(container, `Fan ${i}`, `${hwmonPath}/fan${i}_input`, false, fanData);
    }

    const gpuFanData = savedData?.Gpus?.[0]|| null;

    createFanUI(container, "GPU Fan", gpuFanFile, isNvidia, gpuFanData);
}

//LOADING
function createFanUI(container, fanName, fanFile, isNvidia, savedData = null) {
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
    pwmInput.max = '255';
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

    /*const applyBtn = document.createElement('button');
    applyBtn.textContent = '✔';
    applyBtn.style.width = '30px';
    applyBtn.style.cursor = 'pointer';*/

    pwmCheckbox.addEventListener('change', () => {
        pwmInput.disabled = !pwmCheckbox.checked;
        pwmInput.style.opacity = pwmCheckbox.checked ? '1' : '0.5';
    });

    pwmInput.addEventListener('input', () => {
        if (pwmCheckbox.checked) pwmValueLabel.textContent = pwmInput.value;
    });

    /*applyBtn.addEventListener('click', async () => {
        saveData();
    });*/

    [pwmLabel,pwmCheckbox,pwmvalLabel, pwmInput, pwmValueLabel,curveselect].forEach(el => inputContainer.appendChild(el));
    content.appendChild(inputContainer);
    fanContainer.appendChild(content);

    container.appendChild(fanContainer);

    async function updateSpeed() {
        try {
            const speed = isNvidia && fanFile === "NVIDIA GPU"
                ? await getNvidiaFan()
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
    editBtn.textContent = '✎'; 
    editBtn.className = 'curve-action-btn';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑'; 
    deleteBtn.className = 'curve-action-btn';
    deleteBtn.addEventListener('click', () => {
        curvesContainer.removeChild(curveContainer);
        deleteSelect(curveContainer);
    });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '❐'; 
    copyBtn.className = 'curve-action-btn';
    copyBtn.addEventListener('click', () => {
        const miniCanvas = curveContainer.querySelector('.curve-mini-canvas');
        let points = [];
        try { points = JSON.parse(miniCanvas.dataset.points); } catch { points = [{ x: 0, y: 0 }]; }

        const name = "Copy of "+curveContainer.querySelector('.curve-title')?.textContent ?? 'Curve';
        const newCurve = createCurveElement(false, name, null, JSON.parse(JSON.stringify(points)));
        updateCurveSelect(newCurve);
    });



    actionBtnContainer.appendChild(editBtn); 
    actionBtnContainer.appendChild(copyBtn);
    actionBtnContainer.appendChild(deleteBtn);
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
    const curve = createCurveElement(false, `Curve`);
    updateCurveSelect(curve);
});

// ==================== STORAGE ====================
function collectAllData() {
    const data = { Fans: {}, Gpus: {}, Curves: {} };

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
        if (isGpu) data.Gpus[0] = fanData;
        else data.Fans[idx+1] = fanData;
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
    try {
        const data = collectAllData();
        await window.electronAPI.saveAllData(configPath,data);
        markSaved();
    } catch (err) {
        console.error('Save failed:', err);
        markSaveError();
    }
}
function updateCurveSelect(curve) {
    const curveselects = document.querySelectorAll('.myCurveSelect');

    curveselects.forEach(curveselect => {
        const title = curve.querySelector('.curve-title');
        const id = curve.dataset.id;
        if (title) {
            curveselect.add(new Option(title.textContent, id));
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

// ==================== GLOBAL ACTION BAR ====================
const tempdisplay= document.getElementById('globalTempReading');

async function updateTemps() {
    try {
        const data = await loadAllData(cachePath);
        tempdisplay.textContent = 'CPU: '+data?.cpu_temp+' °C        GPU: '+data?.gpu_temp+' °C';
    } catch {
        tempdisplay.textContent = 'CPU: --- °C        GPU: --- °C';
    }
}

updateTemps();
setInterval(updateTemps, 1000);

document.getElementById('globalApplyBtn').addEventListener('click', saveData);

document.getElementById('globalResetBtn').addEventListener('click', async () => {
    document.getElementById('curvesContainer').innerHTML = '';
    document.getElementById('buttonsContainer').innerHTML = '';
    const savedData = await loadAllData(configPath);
    await loadCurves(savedData);
    await createFanButtons("it87", "it86", "Fans", savedData);
});



//Save logic
const applyBtn = document.getElementById('globalApplyBtn');
const saveStatus = document.getElementById('saveStatus');

let isDirty = false;
let statusTimer = null;

function clearSaveStatusTimer() {
    if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
    }
}

function markSaved() {
    isDirty = false;
    applyBtn.classList.remove('unsaved');

    saveStatus.textContent = 'Config saved';
    saveStatus.classList.remove('unsaved', 'error');
    saveStatus.classList.add('saved');

    document.title = 'pwmctl.';
    clearSaveStatusTimer();

    statusTimer = setTimeout(() => {
        if (!isDirty) {
            saveStatus.textContent = '';
            saveStatus.classList.remove('saved');
        }
    }, 1800);
}

function markSaveError() {
    saveStatus.textContent = 'Save failed';
    saveStatus.classList.remove('saved', 'unsaved');
    saveStatus.classList.add('error');

    clearSaveStatusTimer();
    statusTimer = setTimeout(() => {
        if (isDirty) {
            saveStatus.textContent = 'Unsaved changes';
            saveStatus.classList.remove('saved', 'error');
            saveStatus.classList.add('unsaved');
        } else {
            saveStatus.textContent = '';
            saveStatus.classList.remove('error');
        }
    }, 2500);
}

//nvidia helper functiom
async function getNvidiaFan(){
    try {
        const data = await loadAllData(cachePath);
        return data?.gpu_fan_percent;
    } catch {
        return 0;
    }
}
async function getFanCount(){
        const data = await loadAllData(cachePath);
        return data?.fan_count;
}
