import { formatDegrees } from "./format.js";

function installOrbitPreview(app) {
  const { state, els, previewCtx } = app;
  const clamp = (...args) => app.clamp(...args);
  const getStage = (...args) => app.getStage(...args);
  const generateBoxes = (...args) => app.generateBoxes(...args);
  const roundRect = (...args) => app.roundRect(...args);

function drawPreview() {
  const ctx = previewCtx;
  ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
  const stage = getStage();
  const boxes = generateBoxes();
  drawPreviewBackground(ctx, stage);

  const camera = makeCamera(stage);
  drawGroundPlane(ctx, stage, camera);

  const drawables = [];
  boxes.slice(0, 1800).forEach((box) => {
    drawables.push(...boxFaces(box, camera));
  });
  drawables.sort((a, b) => b.depth - a.depth);
  drawables.forEach((face) => drawFace(ctx, face));

  if (boxes.length > 1800) {
    ctx.save();
    ctx.fillStyle = "#172026";
    ctx.font = `${13 * (window.devicePixelRatio || 1)}px Inter, sans-serif`;
    ctx.fillText("Preview capped at 1800 boxes", 18 * (window.devicePixelRatio || 1), 28 * (window.devicePixelRatio || 1));
    ctx.restore();
  }

  drawAxisGizmo(ctx);
}

function drawPreviewBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, els.previewCanvas.height);
  gradient.addColorStop(0, "#f9fbfc");
  gradient.addColorStop(1, "#dfe7eb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
}

function makeCamera(stage) {
  const yaw = (state.orbit.yaw * Math.PI) / 180;
  const pitch = (state.orbit.pitch * Math.PI) / 180;
  const center = {
    x: stage.width / 2,
    y: 40,
    z: stage.depth / 2,
  };
  const baseScale = Math.min(els.previewCanvas.width / stage.width, els.previewCanvas.height / (stage.depth + 220));
  return {
    yaw,
    pitch,
    center,
    scale: baseScale * 1.65 * state.orbit.zoom,
    ox: els.previewCanvas.width / 2,
    oy: els.previewCanvas.height * 0.57,
  };
}

function project(point, camera) {
  const x = point.x - camera.center.x;
  const y = point.y - camera.center.y;
  const z = point.z - camera.center.z;

  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  const cosP = Math.cos(camera.pitch);
  const sinP = Math.sin(camera.pitch);

  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  const y1 = y * cosP - z1 * sinP;
  const z2 = y * sinP + z1 * cosP;
  const perspective = 1 / (1 + z2 / 2400);

  return {
    x: camera.ox - x1 * camera.scale * perspective,
    y: camera.oy - y1 * camera.scale * perspective,
    depth: z2,
  };
}

function drawGroundPlane(ctx, stage, camera) {
  const corners = [
    { x: 0, y: 0, z: 0 },
    { x: stage.width, y: 0, z: 0 },
    { x: stage.width, y: 0, z: stage.depth },
    { x: 0, y: 0, z: stage.depth },
  ].map((point) => project(point, camera));

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.strokeStyle = "#9aa8b2";
  ctx.lineWidth = 1.4 * (window.devicePixelRatio || 1);
  tracePath(ctx, corners);
  ctx.fill();
  ctx.stroke();

  const grid = 48;
  ctx.strokeStyle = "rgba(126, 142, 153, 0.35)";
  ctx.lineWidth = 1 * (window.devicePixelRatio || 1);
  for (let x = 0; x <= stage.width; x += grid) {
    tracePath(ctx, [
      project({ x, y: 0, z: 0 }, camera),
      project({ x, y: 0, z: stage.depth }, camera),
    ]);
    ctx.stroke();
  }
  for (let z = 0; z <= stage.depth; z += grid) {
    tracePath(ctx, [
      project({ x: 0, y: 0, z }, camera),
      project({ x: stage.width, y: 0, z }, camera),
    ]);
    ctx.stroke();
  }
  ctx.restore();
}

function boxFaces(box, camera) {
  const x1 = box.cx - box.sx / 2;
  const x2 = box.cx + box.sx / 2;
  const y1 = box.cy - box.sy / 2;
  const y2 = box.cy + box.sy / 2;
  const z1 = box.cz - box.sz / 2;
  const z2 = box.cz + box.sz / 2;
  const vertices = {
    a: { x: x1, y: y1, z: z1 },
    b: { x: x2, y: y1, z: z1 },
    c: { x: x2, y: y2, z: z1 },
    d: { x: x1, y: y2, z: z1 },
    e: { x: x1, y: y1, z: z2 },
    f: { x: x2, y: y1, z: z2 },
    g: { x: x2, y: y2, z: z2 },
    h: { x: x1, y: y2, z: z2 },
  };
  const faces = [
    ["a", "b", "c", "d", 0.72],
    ["e", "f", "g", "h", 0.9],
    ["d", "c", "g", "h", 1.15],
    ["a", "b", "f", "e", 0.62],
    ["b", "c", "g", "f", 0.82],
    ["a", "d", "h", "e", 0.68],
  ];

  return faces.map((face) => {
    const points = face.slice(0, 4).map((key) => project(vertices[key], camera));
    return {
      points,
      depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
      color: shadeColor(box.color, face[4]),
    };
  });
}

function drawFace(ctx, face) {
  ctx.save();
  ctx.fillStyle = face.color;
  ctx.strokeStyle = "rgba(20, 26, 30, 0.26)";
  ctx.lineWidth = 0.8 * (window.devicePixelRatio || 1);
  tracePath(ctx, face.points);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function tracePath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (points.length > 2) ctx.closePath();
}

function shadeColor(hex, multiplier) {
  const color = hex.replace("#", "");
  const r = clamp(Math.round(parseInt(color.slice(0, 2), 16) * multiplier), 0, 255);
  const g = clamp(Math.round(parseInt(color.slice(2, 4), 16) * multiplier), 0, 255);
  const b = clamp(Math.round(parseInt(color.slice(4, 6), 16) * multiplier), 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawAxisGizmo(ctx) {
  const dpr = window.devicePixelRatio || 1;
  const origin = {
    x: els.previewCanvas.width - 92 * dpr,
    y: 78 * dpr,
  };
  const length = 42 * dpr;
  const axes = [
    { id: "x", label: "X", color: "#c74461", vector: { x: 1, y: 0, z: 0 } },
    { id: "y", label: "Y", color: "#0f8f8a", vector: { x: 0, y: 1, z: 0 } },
    { id: "z", label: "Z", color: "#326fc0", vector: { x: 0, y: 0, z: 1 } },
  ].map((axis) => ({ ...axis, projected: projectAxisVector(axis.vector) }));

  axes.sort((a, b) => a.projected.depth - b.projected.depth);
  state.axisTargets = [];

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.strokeStyle = "rgba(154, 168, 178, 0.72)";
  ctx.lineWidth = 1 * dpr;
  roundRect(ctx, origin.x - 76 * dpr, origin.y - 56 * dpr, 150 * dpr, 118 * dpr, 8 * dpr);
  ctx.fill();
  ctx.stroke();

  ctx.font = `${10 * dpr}px Inter, sans-serif`;
  ctx.fillStyle = "#45515a";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Yaw ${formatDegrees(state.orbit.yaw)}`, origin.x - 62 * dpr, origin.y + 31 * dpr);
  ctx.fillText(`Pitch ${formatDegrees(state.orbit.pitch)}`, origin.x - 62 * dpr, origin.y + 45 * dpr);

  axes.forEach((axis) => {
    const end = {
      x: origin.x + axis.projected.x * length,
      y: origin.y - axis.projected.y * length,
    };
    ctx.strokeStyle = axis.color;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = axis.color;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 11 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `${11 * dpr}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(axis.label, end.x, end.y + 0.5 * dpr);

    state.axisTargets.push({
      axis: axis.id,
      x: end.x,
      y: end.y,
      radius: 15 * dpr,
    });
  });
  ctx.restore();
}

function projectAxisVector(vector) {
  const yaw = (state.orbit.yaw * Math.PI) / 180;
  const pitch = (state.orbit.pitch * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const x1 = vector.x * cosY - vector.z * sinY;
  const z1 = vector.x * sinY + vector.z * cosY;
  const y1 = vector.y * cosP - z1 * sinP;
  const z2 = vector.y * sinP + z1 * cosP;
  return { x: -x1, y: y1, depth: z2 };
}

function findAxisTarget(event) {
  const rect = els.previewCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const point = {
    x: (event.clientX - rect.left) * dpr,
    y: (event.clientY - rect.top) * dpr,
  };
  return state.axisTargets.find(
    (target) => Math.hypot(point.x - target.x, point.y - target.y) <= target.radius,
  );
}

function snapToAxis(axis) {
  const views = {
    x: { yaw: 90, pitch: 0 },
    y: { yaw: 0, pitch: 90 },
    z: { yaw: 0, pitch: 0 },
  };
  const view = views[axis];
  if (!view) return;
  state.orbit.yaw = view.yaw;
  state.orbit.pitch = view.pitch;
  drawPreview();
}

function onPreviewPointerDown(event) {
  const axisTarget = findAxisTarget(event);
  if (axisTarget) {
    snapToAxis(axisTarget.axis);
    return;
  }
  state.orbit.dragging = true;
  state.orbit.lastX = event.clientX;
  state.orbit.lastY = event.clientY;
  els.previewCanvas.setPointerCapture(event.pointerId);
}

function onPreviewPointerMove(event) {
  if (!state.orbit.dragging) return;
  const dx = event.clientX - state.orbit.lastX;
  const dy = event.clientY - state.orbit.lastY;
  state.orbit.lastX = event.clientX;
  state.orbit.lastY = event.clientY;
  state.orbit.yaw += dx * 0.35;
  state.orbit.pitch -= dy * 0.22;
  drawPreview();
}

function onPreviewPointerUp() {
  state.orbit.dragging = false;
}

function onPreviewWheel(event) {
  event.preventDefault();
  state.orbit.zoom = clamp(state.orbit.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.2);
  drawPreview();
}

  Object.assign(app, { drawPreview, onPreviewPointerDown, onPreviewPointerMove, onPreviewPointerUp, onPreviewWheel });
}

export { installOrbitPreview };
