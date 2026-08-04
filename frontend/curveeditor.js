export function openCurveEditor(points, miniCanvas, onSave) {
    const MAX_POINTS = 20;
    const FAN_PERCENT_MIN = 0;
    const FAN_PERCENT_MAX = 100;
    const POINT_RADIUS = 7;
    const POINT_HIT_RADIUS = 14;

    function clampPercent(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return FAN_PERCENT_MIN;

        return Math.min(
            FAN_PERCENT_MAX,
            Math.max(FAN_PERCENT_MIN, Math.round(numericValue))
        );
    }

    function normalizeStoredPercent(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return FAN_PERCENT_MIN;

        // Alte PWM-Rohwerte bis 255 proportional in Prozent umrechnen.
        if (numericValue > FAN_PERCENT_MAX && numericValue <= 255) {
            return clampPercent((numericValue / 255) * FAN_PERCENT_MAX);
        }

        return clampPercent(numericValue);
    }

    points = Array.isArray(points) && points.length > 0
        ? points.map(point => ({
            ...point,
            y: normalizeStoredPercent(point?.y)
        }))
        : [{ x: 0, y: 0 }];

    const overlay = document.createElement('div');
    overlay.className = 'curve-editor-overlay';

    const editorContainer = document.createElement('div');
    editorContainer.className = 'curve-editor-container';
    overlay.appendChild(editorContainer);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
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

    /**
     * Rechnet die Mausposition aus CSS-Pixeln in die internen
     * Pixelkoordinaten des Canvas um. Das verhindert einen Versatz,
     * wenn das Canvas über CSS größer oder kleiner dargestellt wird.
     */
    function getCanvasMousePosition(event) {
        const rect = canvas.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    /**
     * Rechnet interne Canvas-Koordinaten in Temperatur und PWM um.
     */
    function canvasPositionToValues(canvasX, canvasY) {
        return {
            x: clamp(
                (canvasX - 50) / (canvas.width - 70) * 100,
                0,
                100
            ),
            y: clamp(
                FAN_PERCENT_MAX
                    - (canvasY - 20) / (canvas.height - 60) * FAN_PERCENT_MAX,
                FAN_PERCENT_MIN,
                FAN_PERCENT_MAX
            )
        };
    }

    /**
     * Rechnet einen Kurvenpunkt in interne Canvas-Koordinaten um.
     */
    function pointToCanvasPosition(point) {
        return {
            x: 50 + point.x / 100 * (canvas.width - 70),
            y: canvas.height - 40
                - point.y / FAN_PERCENT_MAX * (canvas.height - 60)
        };
    }

    /**
     * Sucht den nächsten Punkt innerhalb des Auswahlradius.
     * Der Abstand wird in Canvas-Pixeln gemessen und ist deshalb
     * unabhängig von Temperatur- und PWM-Skalierung.
     */
    function findPointAt(canvasX, canvasY, radius = POINT_HIT_RADIUS) {
        let closestPoint = null;
        let closestDistance = Infinity;

        for (const point of points) {
            const position = pointToCanvasPosition(point);
            const distance = Math.hypot(
                position.x - canvasX,
                position.y - canvasY
            );

            if (distance <= radius && distance < closestDistance) {
                closestPoint = point;
                closestDistance = distance;
            }
        }

        return closestPoint;
    }

    function constrainPoint(point) {
        const idx = points.indexOf(point);
        if (idx === -1) return;

        point.y = clampPercent(point.y);

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
        for (let p = 0; p <= FAN_PERCENT_MAX; p += 10) {
            const y = canvas.height - 40 - p / FAN_PERCENT_MAX * (canvas.height - 60);
            ctx.beginPath();
            ctx.moveTo(50, y);
            ctx.lineTo(canvas.width - 20, y);
            ctx.stroke();
            ctx.fillText(`${p}%`, 42, y + 4);
        }
        ctx.restore();

        if (points.length >= 2) {
            ctx.strokeStyle = '#00bcd4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(
                50 + points[0].x / 100 * (canvas.width - 70),
                canvas.height - 40 - points[0].y / FAN_PERCENT_MAX * (canvas.height - 60)
            );

            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(
                    50 + points[i].x / 100 * (canvas.width - 70),
                    canvas.height - 40 - points[i].y / FAN_PERCENT_MAX * (canvas.height - 60)
                );
            }
            ctx.stroke();
        }

        points.forEach(p => {
            ctx.fillStyle = p === selectedPoint ? '#fff' : '#00bcd4';
            ctx.beginPath();
            ctx.arc(
                50 + p.x / 100 * (canvas.width - 70),
                canvas.height - 40 - p.y / FAN_PERCENT_MAX * (canvas.height - 60),
                POINT_RADIUS,
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
            pwmInput.max = String(FAN_PERCENT_MAX);
            pwmInput.step = '1';
            pwmInput.value = Math.round(p.y);
            pwmInput.title = 'PWM (%)';

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
                p.y = clampPercent(pwmInput.value);

                if (Number.isNaN(p.x)) p.x = oldX;
                if (Number.isNaN(p.y)) p.y = oldY;

                constrainPoint(p);
                points.sort((a, b) => a.x - b.x);

                selectedPoint = p;
                activeEditor = null;
                coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)} %`;

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
                    coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)} %`;
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
                coordDisplay.textContent = `Temp: ${p.x.toFixed(0)}°C | PWM: ${p.y.toFixed(0)} %`;
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
        if (e.button !== 0) return;

        const mousePosition = getCanvasMousePosition(e);
        const values = canvasPositionToValues(
            mousePosition.x,
            mousePosition.y
        );

        let x = values.x;
        let y = values.y;

        selectedPoint = findPointAt(
            mousePosition.x,
            mousePosition.y
        );

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

            selectedPoint = {
                x: Math.round(x),
                y: clampPercent(y)
            };

            points.push(selectedPoint);
            points.sort((a, b) => a.x - b.x);

            coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)} %`;
            isDragging = true;
            refreshAll();
            return;
        }

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)} %`;
        isDragging = true;
        drawCurve();
        renderPointsList();
    });

    canvas.addEventListener('mousemove', e => {
        if (!selectedPoint || !isDragging) return;
        if (activeEditor) return;

        const mousePosition = getCanvasMousePosition(e);
        const values = canvasPositionToValues(
            mousePosition.x,
            mousePosition.y
        );

        selectedPoint.x = values.x;
        selectedPoint.y = values.y;
        constrainPoint(selectedPoint);

        coordDisplay.textContent = `Temp: ${selectedPoint.x.toFixed(0)}°C | PWM: ${selectedPoint.y.toFixed(0)} %`;
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

        const mousePosition = getCanvasMousePosition(e);
        const hitPoint = findPointAt(
            mousePosition.x,
            mousePosition.y
        );

        if (!hitPoint) return;

        const index = points.indexOf(hitPoint);

        if (index > 0) {
            points.splice(index, 1);

            if (selectedPoint === hitPoint) {
                selectedPoint = null;
            }

            refreshAll();
        }
    });
}
