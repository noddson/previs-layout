const BOX_TYPES = [
  {
    id: "cube24",
    name: "24 x 24 x 24 cube",
    length: 24,
    depth: 24,
    height: 24,
    cost: 5.89,
    color: "#0f8f8a",
  },
  {
    id: "cube18",
    name: "18 x 18 x 18 cube",
    length: 18,
    depth: 18,
    height: 18,
    cost: 3.11,
    color: "#d88a12",
  },
  {
    id: "tall18",
    name: "18 x 18 x 24 high",
    length: 18,
    depth: 18,
    height: 24,
    cost: 3.74,
    color: "#326fc0",
  },
];

const state = {
  tool: "wall",
  walls: [],
  history: [],
  costs: Object.fromEntries(BOX_TYPES.map((box) => [box.id, box.cost])),
  drag: null,
  blockedReason: null,
  axisTargets: [],
  orbit: {
    yaw: 210,
    pitch: 340,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
  fpv: {
    x: 48,
    z: 48,
    yaw: 0,
    pitch: 0,
    halfSize: 5,
    eyeHeight: 60,
    speed: 96,
    dragging: false,
    lastFrame: 0,
    keys: {},
  },
};

const els = {
  planCanvas: document.querySelector("#planCanvas"),
  previewCanvas: document.querySelector("#previewCanvas"),
  fpvCanvas: document.querySelector("#fpvCanvas"),
  boxType: document.querySelector("#boxType"),
  boxCost: document.querySelector("#boxCost"),
  wallHeight: document.querySelector("#wallHeight"),
  snapSize: document.querySelector("#snapSize"),
  stageWidth: document.querySelector("#stageWidth"),
  stageDepth: document.querySelector("#stageDepth"),
  totalBoxes: document.querySelector("#totalBoxes"),
  totalCost: document.querySelector("#totalCost"),
  boxBreakdown: document.querySelector("#boxBreakdown"),
  wallList: document.querySelector("#wallList"),
  planReadout: document.querySelector("#planReadout"),
  scaleReadout: document.querySelector("#scaleReadout"),
  heightReadout: document.querySelector("#heightReadout"),
  previewReadout: document.querySelector("#previewReadout"),
  fpvReadout: document.querySelector("#fpvReadout"),
  fpvStatus: document.querySelector("#fpvStatus"),
  undoButton: document.querySelector("#undoButton"),
  demoButton: document.querySelector("#demoButton"),
  clearButton: document.querySelector("#clearButton"),
};

const planCtx = els.planCanvas.getContext("2d");
const previewCtx = els.previewCanvas.getContext("2d");
const fpvCtx = els.fpvCanvas.getContext("2d");
let planMetrics = null;

function init() {
  BOX_TYPES.forEach((box) => {
    const option = document.createElement("option");
    option.value = box.id;
    option.textContent = box.name;
    els.boxType.append(option);
  });
  els.boxType.value = BOX_TYPES[0].id;
  els.boxCost.value = BOX_TYPES[0].cost;

  bindEvents();
  addDemoLayout();
  resetFpvToSpawn();
  renderAll();
  requestAnimationFrame(tickFpv);
}

function bindEvents() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.tool;
      document
        .querySelectorAll("[data-tool]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });

  els.boxType.addEventListener("change", () => {
    els.boxCost.value = getBoxCost(els.boxType.value);
    renderAll();
  });

  els.boxCost.addEventListener("input", () => {
    state.costs[els.boxType.value] = getActiveCost();
    renderAll();
  });

  [els.wallHeight, els.snapSize].forEach((input) =>
    input.addEventListener("input", renderAll),
  );
  [els.stageWidth, els.stageDepth].forEach((input) =>
    input.addEventListener("input", () => {
      resetFpvToSpawn();
      renderAll();
    }),
  );

  els.undoButton.addEventListener("click", undo);
  els.demoButton.addEventListener("click", () => {
    pushHistory();
    state.blockedReason = null;
    addDemoLayout();
    resetFpvToSpawn();
    renderAll();
  });
  els.clearButton.addEventListener("click", () => {
    pushHistory();
    state.blockedReason = null;
    state.walls = [];
    resetFpvToSpawn();
    renderAll();
  });

  els.planCanvas.addEventListener("pointerdown", onPlanPointerDown);
  els.planCanvas.addEventListener("pointermove", onPlanPointerMove);
  els.planCanvas.addEventListener("pointerup", onPlanPointerUp);
  els.planCanvas.addEventListener("pointercancel", cancelPlanDrag);
  els.planCanvas.addEventListener("lostpointercapture", cancelPlanDrag);

  els.previewCanvas.addEventListener("pointerdown", onPreviewPointerDown);
  els.previewCanvas.addEventListener("pointermove", onPreviewPointerMove);
  els.previewCanvas.addEventListener("pointerup", onPreviewPointerUp);
  els.previewCanvas.addEventListener("pointercancel", onPreviewPointerUp);
  els.previewCanvas.addEventListener("wheel", onPreviewWheel, { passive: false });

  els.fpvCanvas.addEventListener("pointerdown", onFpvPointerDown);
  els.fpvCanvas.addEventListener("pointermove", onFpvPointerMove);
  els.fpvCanvas.addEventListener("pointerup", onFpvPointerUp);
  els.fpvCanvas.addEventListener("pointercancel", onFpvPointerUp);
  document.addEventListener("pointerlockchange", updateFpvStatus);
  document.addEventListener("mousemove", onFpvMouseMove);
  window.addEventListener("keydown", onFpvKeyDown);
  window.addEventListener("keyup", onFpvKeyUp);
  window.addEventListener("blur", clearFpvKeys);

  window.addEventListener("resize", renderAll);
}

function getActiveBox() {
  return BOX_TYPES.find((box) => box.id === els.boxType.value) || BOX_TYPES[0];
}

function getBox(id) {
  return BOX_TYPES.find((box) => box.id === id) || BOX_TYPES[0];
}

function getStage() {
  return {
    width: clamp(Number(els.stageWidth.value) || 480, 96, 2400),
    depth: clamp(Number(els.stageDepth.value) || 360, 96, 2400),
  };
}

function getSnap() {
  return clamp(Number(els.snapSize.value) || 12, 3, 96);
}

function getWallHeight() {
  return clamp(Number(els.wallHeight.value) || 72, 12, 360);
}

function getActiveCost() {
  return Math.max(0, Number(els.boxCost.value) || 0);
}

function getBoxCost(boxId) {
  return Math.max(0, Number(state.costs[boxId]) || 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pushHistory() {
  state.history.push(JSON.stringify(state.walls));
  if (state.history.length > 60) state.history.shift();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.walls = JSON.parse(previous);
  resetFpvToSpawn();
  renderAll();
}

function addDemoLayout() {
  state.walls = [
    makeWall(96, 72, 384, 72, 120, "cube24"),
    makeWall(360, 96, 360, 240, 120, "cube24"),
    makeWall(96, 240, 384, 240, 120, "cube24"),
    makeWall(96, 96, 96, 240, 120, "cube24"),
    makeWall(216, 264, 216, 336, 72, "cube18"),
    makeWall(276, 264, 276, 336, 72, "cube18"),
  ];
}

function makeWall(x1, y1, x2, y2, height, boxId) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    x1,
    y1,
    x2,
    y2,
    height,
    boxId,
    removedBlocks: [],
  };
}

function renderAll() {
  resizeCanvasToDisplay(els.planCanvas);
  resizeCanvasToDisplay(els.previewCanvas);
  resizeCanvasToDisplay(els.fpvCanvas);
  clampFpvToStage();
  drawPlan();
  drawPreview();
  drawFpv();
  renderSummary();
}

function resizeCanvasToDisplay(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function getPlanMetrics() {
  const stage = getStage();
  const padding = 34 * (window.devicePixelRatio || 1);
  const scale = Math.min(
    (els.planCanvas.width - padding * 2) / stage.width,
    (els.planCanvas.height - padding * 2) / stage.depth,
  );
  const width = stage.width * scale;
  const depth = stage.depth * scale;
  return {
    stage,
    padding,
    scale,
    left: (els.planCanvas.width - width) / 2,
    top: (els.planCanvas.height - depth) / 2,
    width,
    depth,
  };
}

function worldToPlan(point) {
  return {
    x: planMetrics.left + point.x * planMetrics.scale,
    y: planMetrics.top + point.y * planMetrics.scale,
  };
}

function planToWorld(event) {
  const rect = els.planCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;
  const snap = getSnap();
  return {
    x: clamp(Math.round(((x - planMetrics.left) / planMetrics.scale) / snap) * snap, 0, planMetrics.stage.width),
    y: clamp(Math.round(((y - planMetrics.top) / planMetrics.scale) / snap) * snap, 0, planMetrics.stage.depth),
  };
}

function onPlanPointerDown(event) {
  planMetrics = getPlanMetrics();
  const point = planToWorld(event);
  els.planCanvas.setPointerCapture(event.pointerId);

  if (state.tool === "erase") {
    state.blockedReason = null;
    const hit = findBlockAt(point);
    if (hit) {
      pushHistory();
      eraseBlock(hit);
      resetFpvToSpawn();
      renderAll();
    }
    return;
  }

  state.drag = { start: point, current: point };
  drawPlan();
}

function onPlanPointerMove(event) {
  if (!state.drag) return;
  state.drag.current = planToWorld(event);
  drawPlan();
}

function onPlanPointerUp(event) {
  if (!state.drag) return;
  state.drag.current = planToWorld(event);
  const created = buildWallsFromDrag(state.drag.start, state.drag.current);
  state.drag = null;
  if (created.length) {
    const placement = validatePlacement(created);
    if (placement.ok) {
      state.blockedReason = null;
      pushHistory();
      state.walls.push(...created);
      resetFpvToSpawn();
    } else {
      state.blockedReason = placement.reason;
    }
  }
  renderAll();
}

function cancelPlanDrag() {
  if (!state.drag) return;
  state.drag = null;
  drawPlan();
}

function buildWallsFromDrag(start, end) {
  const box = getActiveBox();
  const height = getWallHeight();

  if (state.tool === "wall") {
    const line = orthogonalLine(start, end);
    if (distance(line.x1, line.y1, line.x2, line.y2) < getSnap()) return [];
    return [makeWall(line.x1, line.y1, line.x2, line.y2, height, box.id)];
  }

  if (state.tool === "room") {
    const stage = getStage();
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const rawWidth = Math.abs(end.x - start.x);
    const rawDepth = Math.abs(end.y - start.y);
    const minWidthUnits = Math.ceil((box.depth * 2) / box.length);
    const width = fitBoxMultiple(rawWidth, box.length, minWidthUnits, stage.width - x1);
    const interiorDepth = fitBoxMultiple(
      Math.max(0, rawDepth - box.depth * 2),
      box.length,
      1,
      stage.depth - y1 - box.depth * 2,
    );
    if (!width || !interiorDepth) return [];

    const x2 = x1 + width;
    const sideX = x2 - box.depth;
    const sideY = y1 + box.depth;
    const bottomY = sideY + interiorDepth;

    return [
      makeWall(x1, y1, x2, y1, height, box.id),
      makeWall(sideX, sideY, sideX, bottomY, height, box.id),
      makeWall(x1, bottomY, x2, bottomY, height, box.id),
      makeWall(x1, sideY, x1, bottomY, height, box.id),
    ];
  }

  return [];
}

function fitBoxMultiple(rawSize, unit, minUnits, maxSize) {
  const maxUnits = Math.floor(maxSize / unit);
  if (maxUnits < minUnits) return 0;
  return clamp(Math.round(rawSize / unit), minUnits, maxUnits) * unit;
}

function orthogonalLine(start, end) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx >= dy) {
    return { x1: start.x, y1: start.y, x2: end.x, y2: start.y };
  }
  return { x1: start.x, y1: start.y, x2: start.x, y2: end.y };
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function findBlockAt(point) {
  for (const wall of state.walls) {
    const footprint = generateFootprints(wall).find((item) => pointInFootprint(point, item));
    if (footprint) return { wall, blockIndex: footprint.blockIndex };
  }
  return null;
}

function eraseBlock(hit) {
  const removed = new Set(hit.wall.removedBlocks || []);
  removed.add(hit.blockIndex);
  hit.wall.removedBlocks = [...removed];
  if (!generateFootprints(hit.wall).length) {
    state.walls = state.walls.filter((wall) => wall.id !== hit.wall.id);
  }
}

function drawPlan() {
  planMetrics = getPlanMetrics();
  planCtx.clearRect(0, 0, els.planCanvas.width, els.planCanvas.height);
  drawPlanBackground();
  state.walls.forEach((wall) => drawPlanWall(wall, false));

  if (state.drag) {
    const previewWalls = buildWallsFromDrag(state.drag.start, state.drag.current);
    const placement = validatePlacement(previewWalls);
    state.blockedReason = previewWalls.length && !placement.ok ? placement.reason : null;
    previewWalls.forEach((wall) => drawPlanWall(wall, true, !placement.ok));
  }
  drawPlanStatus();
}

function drawPlanBackground() {
  const { left, top, width, depth, stage, scale } = planMetrics;
  planCtx.save();
  planCtx.fillStyle = "#f8fafb";
  planCtx.fillRect(left, top, width, depth);
  planCtx.strokeStyle = "#172026";
  planCtx.lineWidth = 2 * (window.devicePixelRatio || 1);
  planCtx.strokeRect(left, top, width, depth);

  const grid = getSnap();
  const major = 48;
  for (let x = 0; x <= stage.width; x += grid) {
    const px = left + x * scale;
    planCtx.strokeStyle = x % major === 0 ? "#ccd4db" : "#e5eaee";
    planCtx.lineWidth = x % major === 0 ? 1.1 : 0.7;
    planCtx.beginPath();
    planCtx.moveTo(px, top);
    planCtx.lineTo(px, top + depth);
    planCtx.stroke();
  }
  for (let y = 0; y <= stage.depth; y += grid) {
    const py = top + y * scale;
    planCtx.strokeStyle = y % major === 0 ? "#ccd4db" : "#e5eaee";
    planCtx.lineWidth = y % major === 0 ? 1.1 : 0.7;
    planCtx.beginPath();
    planCtx.moveTo(left, py);
    planCtx.lineTo(left + width, py);
    planCtx.stroke();
  }
  planCtx.restore();
}

function drawPlanWall(wall, isPreview, isBlocked = false) {
  const box = getBox(wall.boxId);
  const footprints = generateFootprints(wall);
  const alpha = isBlocked ? 0.42 : isPreview ? 0.52 : 0.86;
  planCtx.save();
  planCtx.globalAlpha = alpha;
  footprints.forEach((footprint) => {
    const rect = footprintToPlanRect(footprint);
    planCtx.fillStyle = isBlocked ? "#c74461" : box.color;
    planCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    planCtx.strokeStyle = "#ffffff";
    planCtx.lineWidth = 1.3 * (window.devicePixelRatio || 1);
    planCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });
  planCtx.restore();

  const label = getWallMetrics(wall);
  const mid = worldToPlan({
    x: (wall.x1 + wall.x2) / 2,
    y: (wall.y1 + wall.y2) / 2,
  });
  planCtx.save();
  planCtx.fillStyle = "#172026";
  planCtx.font = `${12 * (window.devicePixelRatio || 1)}px Inter, sans-serif`;
  planCtx.textAlign = "center";
  planCtx.textBaseline = "middle";
  planCtx.fillText(`${label.count}`, mid.x, mid.y);
  planCtx.restore();
}

function drawPlanStatus() {
  if (!state.blockedReason) return;
  planCtx.save();
  const dpr = window.devicePixelRatio || 1;
  const text = state.blockedReason;
  planCtx.font = `${13 * dpr}px Inter, sans-serif`;
  const textWidth = planCtx.measureText(text).width;
  const x = planMetrics.left + 12 * dpr;
  const y = planMetrics.top + 14 * dpr;
  planCtx.fillStyle = "rgba(199, 68, 97, 0.94)";
  planCtx.fillRect(x - 8 * dpr, y - 12 * dpr, textWidth + 16 * dpr, 28 * dpr);
  planCtx.fillStyle = "#ffffff";
  planCtx.textBaseline = "middle";
  planCtx.fillText(text, x, y + 2 * dpr);
  planCtx.restore();
}

function footprintToPlanRect(footprint) {
  const p = worldToPlan({ x: footprint.x, y: footprint.y });
  return {
    x: p.x,
    y: p.y,
    w: footprint.w * planMetrics.scale,
    h: footprint.d * planMetrics.scale,
  };
}

function generateFootprints(wall) {
  const box = getBox(wall.boxId);
  const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  const length = horizontal ? Math.abs(wall.x2 - wall.x1) : Math.abs(wall.y2 - wall.y1);
  const count = Math.max(1, Math.ceil(length / box.length));
  const direction = horizontal ? Math.sign(wall.x2 - wall.x1) || 1 : Math.sign(wall.y2 - wall.y1) || 1;
  const removed = new Set(wall.removedBlocks || []);
  const footprints = [];

  for (let i = 0; i < count; i += 1) {
    if (removed.has(i)) continue;
    if (horizontal) {
      const x = direction > 0 ? wall.x1 + i * box.length : wall.x1 - (i + 1) * box.length;
      footprints.push({
        blockIndex: i,
        x,
        y: wall.y1,
        w: box.length,
        d: box.depth,
      });
    } else {
      const y = direction > 0 ? wall.y1 + i * box.length : wall.y1 - (i + 1) * box.length;
      footprints.push({
        blockIndex: i,
        x: wall.x1,
        y,
        w: box.depth,
        d: box.length,
      });
    }
  }
  return footprints;
}

function pointInFootprint(point, footprint) {
  return (
    point.x >= footprint.x &&
    point.x <= footprint.x + footprint.w &&
    point.y >= footprint.y &&
    point.y <= footprint.y + footprint.d
  );
}

function getPlacementFootprints(walls) {
  return walls.flatMap((wall) =>
    generateFootprints(wall).map((footprint) => ({
      ...footprint,
      wallId: wall.id,
      rect: {
        left: footprint.x,
        right: footprint.x + footprint.w,
        top: footprint.y,
        bottom: footprint.y + footprint.d,
      },
    })),
  );
}

function validatePlacement(newWalls) {
  if (!newWalls.length) return { ok: true, reason: null };
  const newFootprints = getPlacementFootprints(newWalls);
  const existingFootprints = getPlacementFootprints(state.walls);
  const stage = getStage();

  if (newFootprints.some((footprint) => footprintOutOfBounds(footprint.rect, stage))) {
    return { ok: false, reason: "Blocked: boxes would leave the stage" };
  }

  for (let i = 0; i < newFootprints.length; i += 1) {
    for (let j = i + 1; j < newFootprints.length; j += 1) {
      if (rectsIntersect(newFootprints[i].rect, newFootprints[j].rect)) {
        return { ok: false, reason: "Blocked: boxes would intersect" };
      }
    }
  }

  for (const newFootprint of newFootprints) {
    for (const existingFootprint of existingFootprints) {
      if (rectsIntersect(newFootprint.rect, existingFootprint.rect)) {
        return { ok: false, reason: "Blocked: intersects existing boxes" };
      }
    }
  }

  return { ok: true, reason: null };
}

function footprintOutOfBounds(rect, stage) {
  const epsilon = 0.001;
  return (
    rect.left < -epsilon ||
    rect.top < -epsilon ||
    rect.right > stage.width + epsilon ||
    rect.bottom > stage.depth + epsilon
  );
}

function rectsIntersect(a, b) {
  const epsilon = 0.001;
  return (
    a.left < b.right - epsilon &&
    a.right > b.left + epsilon &&
    a.top < b.bottom - epsilon &&
    a.bottom > b.top + epsilon
  );
}

function getWallMetrics(wall) {
  const box = getBox(wall.boxId);
  const columns = generateFootprints(wall).length;
  const length = columns * box.length;
  const layers = Math.max(1, Math.ceil(wall.height / box.height));
  return {
    length,
    columns,
    layers,
    count: columns * layers,
    cost: columns * layers * getBoxCost(wall.boxId),
  };
}

function generateBoxes() {
  const boxes = [];
  state.walls.forEach((wall) => {
    const box = getBox(wall.boxId);
    const metrics = getWallMetrics(wall);
    const footprints = generateFootprints(wall);

    footprints.forEach((footprint) => {
      for (let layer = 0; layer < metrics.layers; layer += 1) {
        const h = box.height;
        boxes.push({
          cx: footprint.x + footprint.w / 2,
          cy: layer * h + h / 2,
          cz: footprint.y + footprint.d / 2,
          sx: footprint.w,
          sy: h,
          sz: footprint.d,
          color: box.color,
        });
      }
    });
  });
  return boxes;
}

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

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function formatDegrees(value) {
  const rounded = Math.round(normalizeDegrees(value));
  return `${rounded} deg`;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
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

function tickFpv(timestamp) {
  const previous = state.fpv.lastFrame || timestamp;
  const dt = Math.min(0.05, (timestamp - previous) / 1000);
  state.fpv.lastFrame = timestamp;
  if (updateFpvPosition(dt)) drawFpv();
  requestAnimationFrame(tickFpv);
}

function updateFpvPosition(dt) {
  const keys = state.fpv.keys;
  let moveX = 0;
  let moveZ = 0;
  const yaw = (state.fpv.yaw * Math.PI) / 180;
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

  if (keys.w) {
    moveX += forward.x;
    moveZ += forward.z;
  }
  if (keys.s) {
    moveX -= forward.x;
    moveZ -= forward.z;
  }
  if (keys.d) {
    moveX += right.x;
    moveZ += right.z;
  }
  if (keys.a) {
    moveX -= right.x;
    moveZ -= right.z;
  }

  const magnitude = Math.hypot(moveX, moveZ);
  if (!magnitude) return false;

  const step = state.fpv.speed * dt;
  moveFpv((moveX / magnitude) * step, (moveZ / magnitude) * step);
  return true;
}

function moveFpv(dx, dz) {
  const nextX = state.fpv.x + dx;
  if (canPlaceFpv(nextX, state.fpv.z)) state.fpv.x = nextX;

  const nextZ = state.fpv.z + dz;
  if (canPlaceFpv(state.fpv.x, nextZ)) state.fpv.z = nextZ;
}

function canPlaceFpv(x, z) {
  const stage = getStage();
  const h = state.fpv.halfSize;
  const playerRect = {
    left: x - h,
    right: x + h,
    top: z - h,
    bottom: z + h,
  };

  if (footprintOutOfBounds(playerRect, stage)) return false;

  return !getCollisionRects().some((rect) => rectsIntersect(playerRect, rect));
}

function resetFpvToSpawn() {
  const spawn = findFpvSpawn();
  state.fpv.x = spawn.x;
  state.fpv.z = spawn.z;
  state.fpv.yaw = spawn.yaw;
  state.fpv.pitch = 0;
  clearFpvKeys();
  updateFpvStatus();
}

function findFpvSpawn() {
  const stage = getStage();
  const h = state.fpv.halfSize;
  const step = Math.max(6, getSnap() / 2);
  const candidates = [];

  for (let x = h; x <= stage.width - h; x += step) {
    candidates.push({ x, z: h, yaw: 0 });
    candidates.push({ x, z: stage.depth - h, yaw: 180 });
  }
  for (let z = h; z <= stage.depth - h; z += step) {
    candidates.push({ x: h, z, yaw: 90 });
    candidates.push({ x: stage.width - h, z, yaw: 270 });
  }

  const centered = candidates.sort(
    (a, b) =>
      Math.hypot(a.x - stage.width / 2, a.z - stage.depth / 2) -
      Math.hypot(b.x - stage.width / 2, b.z - stage.depth / 2),
  );
  const edgeSpawn = centered.find((candidate) => canPlaceFpv(candidate.x, candidate.z));
  if (edgeSpawn) return edgeSpawn;

  for (let z = h; z <= stage.depth - h; z += step) {
    for (let x = h; x <= stage.width - h; x += step) {
      if (canPlaceFpv(x, z)) return { x, z, yaw: 0 };
    }
  }

  return { x: h, z: h, yaw: 0 };
}

function clampFpvToStage() {
  const stage = getStage();
  const h = state.fpv.halfSize;
  state.fpv.x = clamp(state.fpv.x, h, stage.width - h);
  state.fpv.z = clamp(state.fpv.z, h, stage.depth - h);
}

function getCollisionRects() {
  return getPlacementFootprints(state.walls).map((footprint) => footprint.rect);
}

function onFpvKeyDown(event) {
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d"].includes(key) || !shouldCaptureFpvKeys()) return;
  event.preventDefault();
  state.fpv.keys[key] = true;
}

function onFpvKeyUp(event) {
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d"].includes(key)) return;
  state.fpv.keys[key] = false;
}

function shouldCaptureFpvKeys() {
  return document.activeElement === els.fpvCanvas || document.pointerLockElement === els.fpvCanvas;
}

function onFpvPointerDown(event) {
  els.fpvCanvas.focus();
  state.fpv.dragging = true;
  els.fpvCanvas.setPointerCapture(event.pointerId);
  if (els.fpvCanvas.requestPointerLock) {
    const lockRequest = els.fpvCanvas.requestPointerLock();
    if (lockRequest?.catch) lockRequest.catch(() => {});
  }
}

function onFpvPointerMove(event) {
  if (document.pointerLockElement === els.fpvCanvas || !state.fpv.dragging) return;
  rotateFpv(event.movementX || 0, event.movementY || 0);
}

function onFpvPointerUp() {
  state.fpv.dragging = false;
}

function onFpvMouseMove(event) {
  if (document.pointerLockElement !== els.fpvCanvas) return;
  rotateFpv(event.movementX || 0, event.movementY || 0);
}

function rotateFpv(dx, dy) {
  state.fpv.yaw += dx * 0.12;
  state.fpv.pitch = clamp(state.fpv.pitch - dy * 0.1, -82, 82);
  drawFpv();
}

function updateFpvStatus() {
  if (!els.fpvStatus) return;
  if (document.pointerLockElement !== els.fpvCanvas) state.fpv.dragging = false;
  els.fpvStatus.textContent =
    document.pointerLockElement === els.fpvCanvas ? "Mouse look active" : "Ground locked";
}

function clearFpvKeys() {
  state.fpv.keys = {};
}

function drawFpv() {
  const ctx = fpvCtx;
  ctx.clearRect(0, 0, els.fpvCanvas.width, els.fpvCanvas.height);
  drawFpvBackground(ctx);

  const camera = makeFpvCamera();
  drawFpvGround(ctx, camera);

  const drawables = [];
  generateBoxes()
    .slice(0, 1800)
    .forEach((box) => {
      drawables.push(...boxFacesFpv(box, camera));
    });
  drawables.sort((a, b) => b.depth - a.depth);
  drawables.forEach((face) => drawFace(ctx, face));

  drawFpvHud(ctx);
}

function drawFpvBackground(ctx) {
  const horizon = els.fpvCanvas.height * 0.52;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#dfeef4");
  sky.addColorStop(1, "#f7fbfd");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, els.fpvCanvas.width, horizon);

  const floor = ctx.createLinearGradient(0, horizon, 0, els.fpvCanvas.height);
  floor.addColorStop(0, "#d8e0e4");
  floor.addColorStop(1, "#bfcbd2");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, els.fpvCanvas.width, els.fpvCanvas.height - horizon);
}

function makeFpvCamera() {
  return {
    x: state.fpv.x,
    y: state.fpv.eyeHeight,
    z: state.fpv.z,
    yaw: (state.fpv.yaw * Math.PI) / 180,
    pitch: (state.fpv.pitch * Math.PI) / 180,
    focal: Math.min(els.fpvCanvas.width, els.fpvCanvas.height) * 0.82,
    near: 3,
  };
}

function projectFpv(point, camera) {
  const cameraPoint = worldToFpvCamera(point, camera);
  if (cameraPoint.z <= camera.near) return null;
  return projectFpvCamera(cameraPoint, camera);
}

function worldToFpvCamera(point, camera) {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  const cosP = Math.cos(camera.pitch);
  const sinP = Math.sin(camera.pitch);

  const x1 = dx * cosY - dz * sinY;
  const z1 = dx * sinY + dz * cosY;
  const y1 = dy * cosP - z1 * sinP;
  const z2 = dy * sinP + z1 * cosP;

  return { x: x1, y: y1, z: z2 };
}

function projectFpvCamera(point, camera) {
  return {
    x: els.fpvCanvas.width / 2 + (point.x * camera.focal) / point.z,
    y: els.fpvCanvas.height / 2 - (point.y * camera.focal) / point.z,
    depth: point.z,
  };
}

function clipPolygonToNearPlane(points, near) {
  const clipped = [];

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const currentInside = current.z >= near;
    const nextInside = next.z >= near;

    if (currentInside && nextInside) {
      clipped.push(next);
    } else if (currentInside && !nextInside) {
      clipped.push(intersectNearPlane(current, next, near));
    } else if (!currentInside && nextInside) {
      clipped.push(intersectNearPlane(current, next, near));
      clipped.push(next);
    }
  }

  return clipped;
}

function intersectNearPlane(a, b, near) {
  const t = (near - a.z) / (b.z - a.z);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: near,
  };
}

function drawFpvGround(ctx, camera) {
  const stage = getStage();
  const corners = [
    { x: 0, y: 0, z: 0 },
    { x: stage.width, y: 0, z: 0 },
    { x: stage.width, y: 0, z: stage.depth },
    { x: 0, y: 0, z: stage.depth },
  ]
    .map((point) => projectFpv(point, camera))
    .filter(Boolean);

  if (corners.length === 4) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.strokeStyle = "#7b8a93";
    ctx.lineWidth = 1.4 * (window.devicePixelRatio || 1);
    tracePath(ctx, corners);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(70, 84, 94, 0.28)";
  ctx.lineWidth = 1 * (window.devicePixelRatio || 1);
  for (let x = 0; x <= stage.width; x += 48) {
    drawFpvLine(ctx, { x, y: 0, z: 0 }, { x, y: 0, z: stage.depth }, camera);
  }
  for (let z = 0; z <= stage.depth; z += 48) {
    drawFpvLine(ctx, { x: 0, y: 0, z }, { x: stage.width, y: 0, z }, camera);
  }
  ctx.restore();
}

function drawFpvLine(ctx, a, b, camera) {
  const pa = projectFpv(a, camera);
  const pb = projectFpv(b, camera);
  if (!pa || !pb) return;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

function boxFacesFpv(box, camera) {
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
    ["e", "f", "g", "h", 0.92],
    ["d", "c", "g", "h", 1.12],
    ["a", "b", "f", "e", 0.62],
    ["b", "c", "g", "f", 0.82],
    ["a", "d", "h", "e", 0.68],
  ];

  return faces.flatMap((face) => {
    const cameraPoints = face.slice(0, 4).map((key) => worldToFpvCamera(vertices[key], camera));
    const clipped = clipPolygonToNearPlane(cameraPoints, camera.near);
    if (clipped.length < 3) return [];
    const points = clipped.map((point) => projectFpvCamera(point, camera));
    return {
      points,
      depth: clipped.reduce((sum, point) => sum + point.z, 0) / clipped.length,
      color: shadeColor(box.color, face[4]),
    };
  });
}

function drawFpvHud(ctx) {
  const dpr = window.devicePixelRatio || 1;
  const text = `X ${Math.round(state.fpv.x)} in  Z ${Math.round(state.fpv.z)} in  Yaw ${formatDegrees(state.fpv.yaw)}  Pitch ${formatDegrees(state.fpv.pitch)}`;
  ctx.save();
  ctx.fillStyle = "rgba(23, 27, 31, 0.72)";
  ctx.fillRect(14 * dpr, 14 * dpr, 340 * dpr, 30 * dpr);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${12 * dpr}px Inter, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 24 * dpr, 30 * dpr);
  ctx.restore();
}

function renderSummary() {
  const totals = summarizeLayout();
  els.totalBoxes.textContent = totals.boxes.toLocaleString();
  els.totalCost.textContent = formatMoney(totals.cost);
  els.planReadout.textContent =
    state.blockedReason ||
    `${state.walls.length} wall ${state.walls.length === 1 ? "run" : "runs"}`;
  els.scaleReadout.textContent = `1 square = ${getSnap()} in`;
  els.heightReadout.textContent = `${formatFeetInches(getWallHeight())} active height`;

  renderBreakdown(totals.byType);
  renderWallList();
}

function summarizeLayout() {
  const byType = new Map();
  let boxes = 0;
  let cost = 0;

  state.walls.forEach((wall) => {
    const metrics = getWallMetrics(wall);
    const box = getBox(wall.boxId);
    boxes += metrics.count;
    cost += metrics.cost;
    const existing = byType.get(wall.boxId) || {
      box,
      count: 0,
      cost: 0,
      length: 0,
    };
    existing.count += metrics.count;
    existing.cost += metrics.cost;
    existing.length += metrics.length;
    byType.set(wall.boxId, existing);
  });

  return { boxes, cost, byType };
}

function renderBreakdown(byType) {
  els.boxBreakdown.innerHTML = "";
  if (!byType.size) {
    els.boxBreakdown.innerHTML = `<div class="empty-state">No boxes yet.</div>`;
    return;
  }

  byType.forEach((item) => {
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = `
      <span class="swatch" style="background:${item.box.color}"></span>
      <span class="row-title">${item.box.name}<span class="row-meta">${formatFeetInches(item.length)} linear run, ${formatMoney(item.cost)}</span></span>
      <span class="row-value">${item.count}</span>
    `;
    els.boxBreakdown.append(row);
  });
}

function renderWallList() {
  els.wallList.innerHTML = "";
  if (!state.walls.length) {
    els.wallList.innerHTML = `<div class="empty-state">No wall runs.</div>`;
    return;
  }

  state.walls.forEach((wall, index) => {
    const metrics = getWallMetrics(wall);
    const box = getBox(wall.boxId);
    const row = document.createElement("div");
    row.className = "wall-row";
    row.innerHTML = `
      <span class="swatch" style="background:${box.color}"></span>
      <span class="row-title">Run ${index + 1}<span class="row-meta">${formatFeetInches(metrics.length)} long, ${formatFeetInches(wall.height)} high, ${formatMoney(metrics.cost)}</span></span>
      <span class="row-value">${metrics.count}</span>
    `;
    els.wallList.append(row);
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFeetInches(inches) {
  const rounded = Math.round(inches);
  const feet = Math.floor(rounded / 12);
  const inch = rounded % 12;
  if (!feet) return `${inch} in`;
  if (!inch) return `${feet} ft`;
  return `${feet} ft ${inch} in`;
}

init();
