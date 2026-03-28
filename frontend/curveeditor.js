export function openCurveEditor(points, miniCanvas, onSave) {
    const MAX_POINTS = 20;

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

    const side = document.createElement('div');
    side.className = 'curve-editor-side';
    editorContainer.appendChild(side);

    const sideTitle = document.createElement('div');
    sideTitle.className = 'curve-editor-side-title';
    side.appendChild(sideTitle);

    const pointsList = document.createElement('div');
    pointsList.className = 'curve-editor-points-list';
    side.appendChild(pointsList);

    const coordDisplay = document.createElement('div');
    coordDisplay.className = 'curve-editor-coord';
    editorContainer.appendChild(coordDisplay);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.className = 'curve-editor-close';
    closeBtn.addEventListener('click', () => {
        miniCanvas.dataset.points = JSON.stringify(points);
        if (onSave) onSave(points);
        document.body.removeChild(overlay);
    });
    editorContainer.appendChild(closeBtn);

    document.body.appendChild(overlay);
    const ctx = canvas.getContext('2d');

    if (!points.find(p => p.x === 0)) points.unshift({ x: 0, y: 0 });
    points.sort((a, b) => a.x - b.x);

    if (points.length > MAX_POINTS) {
        points.splice(MAX_POINTS);
    }

    let selectedPoint = null;
    let isDragging = false;
    let activeEditor = null;

    function updateTitle() {
        sideTitle.textContent = `Punkte (${points.length}/${MAX_POINTS})`;
    }

    function clamp(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    function constrainPoint(point) {
        const idx = points.indexOf(point);
        if (idx === -1) return;

        point.y = clamp(Math.round(point.y), 0, 255);

        if (idx === 0) {
            point.x = 0;
        } else {
            point.x = clamp(Math.round(point.x), 0, 100);
        }

        if (idx > 0) {
            const prev = points[idx - 1];
            point.x = Math.max(point.x, prev.x);
            point.y = Math.max(point.y, prev.y);
        }

        if (idx < points.length - 1) {
            const next = points[idx + 1];
            point.x = Math.min(point.x, next.x);
            point.y = Math.min(point.y, next.y);
        }
    }

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

        // Raster X
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

        // Raster Y
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
            ctx.fillText(p, 35, y + 4);
        }
        ctx.restore();

        if (points.length >= 2) {
            ctx.strokeStyle = '#00bcd4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(
                50 + points[0].x / 100 * (canvas.width - 70),
                canvas.height - 40 - points[0].y / 255 * (canvas.height - 60)
            );

            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(
                    50 + points[i].x / 100 * (canvas.width - 70),
                    canvas.height - 40 - points[i].y / 255 * (canvas.height - 60)
                );
            }
            ctx.stroke();
        }

        points.forEach(p => {
            ctx.fillStyle = p === selectedPoint ? '#fff' : '#00bcd4';
            ctx.beginPath();
            ctx.arc(
                50 + p.x / 100 * (canvas.width - 70),
                canvas.height - 40 - p.y / 255 * (canvas.height - 60),
                5,
                0,
                2 * Math.PI
            );
            ctx.fill();
        });
    }

    function renderPointsList() {
        if (activeEditor) return;

        updateTitle();
        pointsList.innerHTML = '';

        points.forEach((p, index) => {
            const row = document.createElement('div');
            row.className = 'curve-editor-point-row';
            if (p === selectedPoint) row.classList.add('active');

            const label = document.createElement('div');
            label.className = 'curve-editor-point-label';
            label.textContent = `P${index + 1}`;
            row.appendChild(label);

            const inputs = document.createElement('div');
            inputs.className = 'curve-editor-point-inputs';

            const tempInput = document.createElement('input');
            tempInput.type = 'number';
            tempInput.min = '0';
            tempInput.max = '100';
            tempInput.step = '1';
            tempInput.value = Math.round(p.x);
            tempInput.disabled = index === 0;
            tempInput.title = 'Temperatur';

            const pwmInput = document.createElement('input');
            pwmInput.type = 'number';
            pwmInput.min = '0';
            pwmInput.max = '255';
            pwmInput.step = '1';
            pwmInput.value = Math.round(p.y);
            pwmInput.title = 'PWM';

            inputs.appendChild(tempInput);
            inputs.appendChild(pwmInput);
            row.appendChild(inputs);

            if (index !== 0) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'curve-editor-delete-point';
                deleteBtn.textContent = '✕';
                deleteBtn.type = 'button';

                deleteBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    points.splice(index, 1);
                    if (selectedPoint === p) selectedPoint = null;
                    drawCurve();
                    renderPointsList();
                });

                row.appendChild(deleteBtn);
            }

            function commit() {
                const oldX = p.x;
                const oldY = p.y;

                if (index !== 0) p.x = Number(tempInput.value);
                p.y = Number(pwmInput.value);

                if (Number.isNaN(p.x)) p.x = oldX;
                if (Number.isNaN(p.y)) p.y = oldY;

                constrainPoint(p);
                points.sort((a, b) => a.x - b.x);

                selectedPoint = p;
                activeEditor = null;
                coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)}`;

                drawCurve();
                renderPointsList();
            }

            [tempInput, pwmInput].forEach(input => {
                input.addEventListener('mousedown', e => e.stopPropagation());
                input.addEventListener('click', e => e.stopPropagation());

                input.addEventListener('focus', e => {
                    e.stopPropagation();
                    selectedPoint = p;
                    activeEditor = p;
                    coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)}`;
                    drawCurve();
                });

                input.addEventListener('keydown', e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        input.blur();
                    }
                });

                input.addEventListener('change', commit);
                input.addEventListener('blur', commit);
            });

            row.addEventListener('click', () => {
                selectedPoint = p;
                coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)}`;
                drawCurve();
                renderPointsList();
            });

            pointsList.appendChild(row);
        });
    }

    function refreshAll() {
        points.sort((a, b) => a.x - b.x);

        if (points.length > MAX_POINTS) {
            points.splice(MAX_POINTS);
        }

        updateTitle();
        drawCurve();
        renderPointsList();
    }

    updateTitle();
    drawCurve();
    renderPointsList();

    canvas.addEventListener('mousedown', e => {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        let y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        x = clamp(x, 0, 100);
        y = clamp(y, 0, 255);

        if (e.button !== 0) return;

        selectedPoint = points.find(p => Math.hypot(p.x - x, p.y - y) < 4);

        if (!selectedPoint) {
            if (points.length >= MAX_POINTS) {
                coordDisplay.textContent = `Maximal ${MAX_POINTS} Punkte erreicht`;
                return;
            }

            const prev = points.filter(p => p.x <= x).pop();
            const next = points.find(p => p.x >= x);

            if (prev) {
                x = Math.max(x, prev.x);
                y = Math.max(y, prev.y);
            }
            if (next) {
                x = Math.min(x, next.x);
                y = Math.min(y, next.y);
            }

            selectedPoint = { x: Math.round(x), y: Math.round(y) };
            points.push(selectedPoint);
            points.sort((a, b) => a.x - b.x);

            coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
            isDragging = true;
            refreshAll();
            return;
        }

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
        isDragging = true;
        drawCurve();
        renderPointsList();
    });

    canvas.addEventListener('mousemove', e => {
        if (!selectedPoint || !isDragging) return;
        if (activeEditor) return;

        const rect = canvas.getBoundingClientRect();
        let newX = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        let newY = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        selectedPoint.x = newX;
        selectedPoint.y = newY;
        constrainPoint(selectedPoint);

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)}`;
        refreshAll();
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - 50) / (canvas.width - 70) * 100;
        const y = 255 - (e.clientY - rect.top - 20) / (canvas.height - 60) * 255;

        const hit = points.reduce((best, p, idx) => {
            const dist = Math.hypot(p.x - x, p.y - y);
            if (dist < 10 && (!best || dist < best.dist)) return { idx, dist };
            return best;
        }, null);

        if (hit && hit.idx !== 0) {
            const removed = points[hit.idx];
            points.splice(hit.idx, 1);
            if (selectedPoint === removed) selectedPoint = null;
            refreshAll();
        }
    });
}