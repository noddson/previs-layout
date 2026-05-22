import { INTERIOR_HOVER_DELAY_MS } from "./config.js";
import { formatArea, formatFeetInches } from "./format.js";

const PLAN_DRAG_MODE = { DRAW: "draw", MOVE_WALL: "move-wall" };

function installPlanView(app) {
  const { state, els, planCtx } = app;
  let planMetrics = null;
  const clamp = (...args) => app.clamp(...args);
  const resizeCanvasToDisplay = (...args) => app.resizeCanvasToDisplay(...args);
  const resizeFpvRenderer = (...args) => app.resizeFpvRenderer(...args);
  const clampFpvToStage = (...args) => app.clampFpvToStage(...args);
  const drawPreview = (...args) => app.drawPreview(...args);
  const rebuildFpvScene = (...args) => app.rebuildFpvScene(...args);
  const renderFpvFrame = (...args) => app.renderFpvFrame(...args);
  const renderSummary = (...args) => app.renderSummary(...args);
  const getStage = (...args) => app.getStage(...args);
  const getSnap = (...args) => app.getSnap(...args);
  const findBlockAt = (...args) => app.findBlockAt(...args);
  const eraseBlock = (...args) => app.eraseBlock(...args);
  const pushHistory = (...args) => app.pushHistory(...args);
  const resetFpvToSpawn = (...args) => app.resetFpvToSpawn(...args);
  const cloneWall = (...args) => app.cloneWall(...args);
  const setHoveredWallRun = (...args) => app.setHoveredWallRun(...args);
  const getDraggedWall = (...args) => app.getDraggedWall(...args);
  const validatePlacement = (...args) => app.validatePlacement(...args);
  const wallMoved = (...args) => app.wallMoved(...args);
  const buildWallsFromDrag = (...args) => app.buildWallsFromDrag(...args);
  const findInteriorAt = (...args) => app.findInteriorAt(...args);
  const getBox = (...args) => app.getBox(...args);
  const generateFootprints = (...args) => app.generateFootprints(...args);
  const getWallMetrics = (...args) => app.getWallMetrics(...args);
  const roundRect = (...args) => app.roundRect(...args);

function renderAll() {
  resizeCanvasToDisplay(els.planCanvas);
  resizeCanvasToDisplay(els.previewCanvas);
  resizeFpvRenderer();
  clampFpvToStage();
  drawPlan();
  drawPreview();
  rebuildFpvScene();
  renderFpvFrame();
  renderSummary();
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

function planToWorld(event, { snap = true } = {}) {
  const rect = els.planCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;
  const worldX = clamp((x - planMetrics.left) / planMetrics.scale, 0, planMetrics.stage.width);
  const worldY = clamp((y - planMetrics.top) / planMetrics.scale, 0, planMetrics.stage.depth);
  if (!snap) {
    return { x: worldX, y: worldY };
  }

  const snapSize = getSnap();
  return {
    x: clamp(Math.round(worldX / snapSize) * snapSize, 0, planMetrics.stage.width),
    y: clamp(Math.round(worldY / snapSize) * snapSize, 0, planMetrics.stage.depth),
  };
}

function onPlanPointerDown(event) {
  planMetrics = getPlanMetrics();
  const hit = findBlockAt(planToWorld(event, { snap: false }));
  const point = planToWorld(event);
  els.planCanvas.setPointerCapture(event.pointerId);
  clearHoveredInterior();

  if (state.tool === "erase") {
    state.blockedReason = null;
    if (hit) {
      pushHistory();
      eraseBlock(hit);
      resetFpvToSpawn();
      renderAll();
    }
    return;
  }

  if (hit) {
    state.drag = {
      kind: PLAN_DRAG_MODE.MOVE_WALL,
      wallId: hit.wall.id,
      start: point,
      current: point,
      originalWall: cloneWall(hit.wall),
    };
    setHoveredWallRun(hit.wall.id);
    updatePlanCursor("grabbing");
    drawPlan();
    return;
  }

  state.drag = { kind: PLAN_DRAG_MODE.DRAW, start: point, current: point };
  drawPlan();
}

function onPlanPointerMove(event) {
  planMetrics = getPlanMetrics();
  if (!state.drag) {
    updatePlanHover(planToWorld(event, { snap: false }));
    return;
  }
  clearHoveredInterior();
  state.drag.current = planToWorld(event);
  drawPlan();
}

function onPlanPointerLeave() {
  if (state.drag) return;
  setHoveredWallRun(null);
  clearHoveredInterior();
  updatePlanCursor();
}

function onPlanPointerUp(event) {
  if (!state.drag) return;
  state.drag.current = planToWorld(event);
  if (state.drag.kind === PLAN_DRAG_MODE.MOVE_WALL) {
    const nextWall = getDraggedWall(state.drag);
    const placement = validatePlacement([nextWall], { ignoreWallIds: new Set([state.drag.wallId]) });
    if (placement.ok) {
      state.blockedReason = null;
      if (wallMoved(state.drag.originalWall, nextWall)) {
        pushHistory();
        state.walls = state.walls.map((wall) => (wall.id === state.drag.wallId ? nextWall : wall));
        clearHoveredInterior();
        resetFpvToSpawn();
      }
    } else {
      state.blockedReason = placement.reason;
    }
    state.drag = null;
    updatePlanHover(planToWorld(event, { snap: false }));
    renderAll();
    return;
  }

  const created = buildWallsFromDrag(state.drag.start, state.drag.current);
  state.drag = null;
  if (created.length) {
    const placement = validatePlacement(created);
    if (placement.ok) {
      state.blockedReason = null;
      pushHistory();
      state.walls.push(...created);
      clearHoveredInterior();
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
  state.blockedReason = null;
  clearHoveredInterior();
  updatePlanCursor();
  drawPlan();
}

function updatePlanHover(point) {
  const hit = findBlockAt(point);
  if (hit || state.tool === "erase") {
    clearHoveredInterior();
  } else {
    scheduleInteriorHover(point);
  }
  setHoveredWallRun(hit?.wall.id || null);
  updatePlanCursor(hit && state.tool !== "erase" ? "grab" : null);
}

function updatePlanCursor(cursor) {
  els.planCanvas.style.cursor = cursor || (state.tool === "erase" ? "cell" : "crosshair");
}

function clearHoveredInterior({ redraw = false } = {}) {
  const hadHover = Boolean(
    state.hoveredInterior.timer ||
      state.hoveredInterior.key ||
      state.hoveredInterior.candidate ||
      state.hoveredInterior.label,
  );
  if (state.hoveredInterior.timer) {
    window.clearTimeout(state.hoveredInterior.timer);
  }
  state.hoveredInterior.timer = null;
  state.hoveredInterior.key = null;
  state.hoveredInterior.candidate = null;
  state.hoveredInterior.label = null;
  if (redraw && hadHover) drawPlan();
  return hadHover;
}

function scheduleInteriorHover(point) {
  const candidate = findInteriorAt(point);
  if (!candidate) {
    clearHoveredInterior({ redraw: Boolean(state.hoveredInterior.label) });
    return;
  }

  const key = getInteriorCandidateKey(candidate);
  if (state.hoveredInterior.key === key) return;

  const hadVisibleLabel = Boolean(state.hoveredInterior.label);
  clearHoveredInterior();
  state.hoveredInterior.key = key;
  state.hoveredInterior.candidate = candidate;
  state.hoveredInterior.timer = window.setTimeout(() => {
    if (state.drag || state.hoveredInterior.key !== key) return;
    state.hoveredInterior.timer = null;
    state.hoveredInterior.label = makeInteriorLabel(candidate);
    drawPlan();
  }, INTERIOR_HOVER_DELAY_MS);
  if (hadVisibleLabel) drawPlan();
}

function getInteriorCandidateKey(candidate) {
  return [candidate.left, candidate.top, candidate.right, candidate.bottom]
    .map((value) => Math.round(value * 1000) / 1000)
    .join(":");
}

function makeInteriorLabel(candidate) {
  const width = candidate.right - candidate.left;
  const depth = candidate.bottom - candidate.top;
  return {
    x: candidate.left + width / 2,
    y: candidate.top + depth / 2,
    width,
    depth,
    areaSqFt: (width * depth) / 144,
  };
}

function drawPlan() {
  planMetrics = getPlanMetrics();
  planCtx.clearRect(0, 0, els.planCanvas.width, els.planCanvas.height);
  drawPlanBackground();
  const movingWallId = state.drag?.kind === PLAN_DRAG_MODE.MOVE_WALL ? state.drag.wallId : null;
  state.walls.forEach((wall) => {
    if (wall.id !== movingWallId) drawPlanWall(wall, false);
  });
  const hoveredWall =
    movingWallId && movingWallId === state.hoveredWallId
      ? getDraggedWall(state.drag)
      : state.walls.find((wall) => wall.id === state.hoveredWallId);
  if (hoveredWall) drawPlanWallHighlight(hoveredWall);

  if (state.drag?.kind === PLAN_DRAG_MODE.DRAW) {
    const previewWalls = buildWallsFromDrag(state.drag.start, state.drag.current, {
      includeRoomLabel: state.tool === "room",
    });
    const placement = validatePlacement(previewWalls);
    state.blockedReason = previewWalls.length && !placement.ok ? placement.reason : null;
    previewWalls.forEach((wall) => drawPlanWall(wall, true, !placement.ok));
    drawRoomLabels(previewWalls, !placement.ok);
  } else if (state.drag?.kind === PLAN_DRAG_MODE.MOVE_WALL) {
    const movedWall = getDraggedWall(state.drag);
    const placement = validatePlacement([movedWall], { ignoreWallIds: new Set([state.drag.wallId]) });
    state.blockedReason = placement.ok ? null : placement.reason;
    drawPlanWall(movedWall, true, !placement.ok);
    drawPlanWallHighlight(movedWall);
  }
  drawHoveredInterior();
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

function drawPlanWallHighlight(wall) {
  const dpr = window.devicePixelRatio || 1;
  const footprints = generateFootprints(wall);
  planCtx.save();
  planCtx.setLineDash([7 * dpr, 4 * dpr]);
  footprints.forEach((footprint) => {
    const rect = footprintToPlanRect(footprint);
    const padding = 3 * dpr;
    planCtx.strokeStyle = "#172026";
    planCtx.lineWidth = 6 * dpr;
    planCtx.strokeRect(
      rect.x - padding,
      rect.y - padding,
      rect.w + padding * 2,
      rect.h + padding * 2,
    );
    planCtx.strokeStyle = "#f2b441";
    planCtx.lineWidth = 3 * dpr;
    planCtx.strokeRect(
      rect.x - padding,
      rect.y - padding,
      rect.w + padding * 2,
      rect.h + padding * 2,
    );
  });
  planCtx.restore();
}

function drawRoomLabels(walls, isBlocked) {
  walls
    .filter((wall) => wall.roomLabel)
    .forEach((wall) => drawRoomLabel(wall.roomLabel, isBlocked));
}

function drawRoomLabel(label, isBlocked) {
  const dpr = window.devicePixelRatio || 1;
  const point = worldToPlan({ x: label.x, y: label.y });
  const title = "Interior";
  const dimensions = `${formatFeetInches(label.width)} x ${formatFeetInches(label.depth)}`;
  const area = Number.isFinite(label.areaSqFt) ? `${formatArea(label.areaSqFt)} sq ft` : null;

  planCtx.save();
  planCtx.font = `${11 * dpr}px Inter, sans-serif`;
  const titleWidth = planCtx.measureText(title).width;
  planCtx.font = `700 ${14 * dpr}px Inter, sans-serif`;
  const dimensionsWidth = planCtx.measureText(dimensions).width;
  planCtx.font = `${11 * dpr}px Inter, sans-serif`;
  const areaWidth = area ? planCtx.measureText(area).width : 0;
  const width = Math.max(titleWidth, dimensionsWidth, areaWidth) + 24 * dpr;
  const height = (area ? 58 : 44) * dpr;
  const x = point.x - width / 2;
  const y = point.y - height / 2;

  planCtx.fillStyle = isBlocked ? "rgba(199, 68, 97, 0.88)" : "rgba(255, 255, 255, 0.92)";
  planCtx.strokeStyle = isBlocked ? "rgba(255, 255, 255, 0.82)" : "rgba(23, 27, 31, 0.28)";
  planCtx.lineWidth = 1 * dpr;
  roundRect(planCtx, x, y, width, height, 8 * dpr);
  planCtx.fill();
  planCtx.stroke();

  planCtx.textAlign = "center";
  planCtx.textBaseline = "middle";
  planCtx.fillStyle = isBlocked ? "#ffffff" : "#68717a";
  planCtx.font = `${10 * dpr}px Inter, sans-serif`;
  planCtx.fillText(title, point.x, point.y - 9 * dpr);
  planCtx.fillStyle = isBlocked ? "#ffffff" : "#172026";
  planCtx.font = `800 ${13 * dpr}px Inter, sans-serif`;
  planCtx.fillText(dimensions, point.x, point.y + (area ? 4 : 8) * dpr);
  if (area) {
    planCtx.fillStyle = isBlocked ? "#ffffff" : "#68717a";
    planCtx.font = `${11 * dpr}px Inter, sans-serif`;
    planCtx.fillText(area, point.x, point.y + 20 * dpr);
  }
  planCtx.restore();
}

function drawHoveredInterior() {
  if (state.drag || !state.hoveredInterior.label) return;
  drawRoomLabel(state.hoveredInterior.label, false);
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

  Object.assign(app, { PLAN_DRAG_MODE, renderAll, getPlanMetrics, worldToPlan, planToWorld, onPlanPointerDown, onPlanPointerMove, onPlanPointerLeave, onPlanPointerUp, cancelPlanDrag, updatePlanHover, updatePlanCursor, clearHoveredInterior, drawPlan });
}

export { installPlanView, PLAN_DRAG_MODE };
