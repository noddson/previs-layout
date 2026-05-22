import { formatFeetInches, formatMinutes, formatMoney } from "./format.js";

function installSummaryView(app) {
  const { state, els } = app;
  const getSnap = (...args) => app.getSnap(...args);
  const getWallHeight = (...args) => app.getWallHeight(...args);
  const getBuilderCount = (...args) => app.getBuilderCount(...args);
  const getWallMetrics = (...args) => app.getWallMetrics(...args);
  const getBox = (...args) => app.getBox(...args);
  const createEmptyState = (...args) => app.createEmptyState(...args);
  const createTrashIcon = (...args) => app.createTrashIcon(...args);
  const drawPlan = (...args) => app.drawPlan(...args);
  const pushHistory = (...args) => app.pushHistory(...args);
  const clearHoveredInterior = (...args) => app.clearHoveredInterior(...args);
  const resetFpvToSpawn = (...args) => app.resetFpvToSpawn(...args);
  const renderAll = (...args) => app.renderAll(...args);

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
  renderBuildTime(totals.boxes);
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
  els.boxBreakdown.replaceChildren();
  if (!byType.size) {
    els.boxBreakdown.append(createEmptyState("No boxes yet."));
    return;
  }

  byType.forEach((item) => {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const value = document.createElement("span");

    row.className = "breakdown-row";
    swatch.className = "swatch";
    swatch.style.backgroundColor = item.box.color;
    title.className = "row-title";
    title.textContent = item.box.name;
    meta.className = "row-meta";
    meta.textContent = `${formatFeetInches(item.length)} linear run, ${formatMoney(item.cost)}`;
    value.className = "row-value";
    value.textContent = item.count.toLocaleString();

    title.append(meta);
    row.append(swatch, title, value);
    els.boxBreakdown.append(row);
  });
}

function renderWallList() {
  els.wallList.replaceChildren();
  if (!state.walls.length) {
    els.wallList.append(createEmptyState("No wall runs."));
    return;
  }

  state.walls.forEach((wall, index) => {
    const metrics = getWallMetrics(wall);
    const box = getBox(wall.boxId);
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const value = document.createElement("span");
    const deleteButton = document.createElement("button");

    row.className = "wall-row";
    row.dataset.wallId = wall.id;
    row.classList.toggle("is-hovered", state.hoveredWallId === wall.id);
    row.addEventListener("mouseenter", () => setHoveredWallRun(wall.id));
    row.addEventListener("mouseleave", () => setHoveredWallRun(null));
    row.addEventListener("pointerenter", () => setHoveredWallRun(wall.id));
    row.addEventListener("pointerleave", () => setHoveredWallRun(null));
    swatch.className = "swatch";
    swatch.style.backgroundColor = box.color;
    title.className = "row-title";
    title.textContent = `Run ${index + 1}`;
    meta.className = "row-meta";
    meta.textContent = `${formatFeetInches(metrics.length)} long, ${formatFeetInches(wall.height)} high, ${formatMoney(metrics.cost)}`;
    value.className = "row-value";
    value.textContent = metrics.count.toLocaleString();
    deleteButton.className = "wall-delete-button";
    deleteButton.type = "button";
    deleteButton.title = `Delete Run ${index + 1}`;
    deleteButton.setAttribute("aria-label", `Delete Run ${index + 1}`);
    deleteButton.append(createTrashIcon());
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteWallRun(wall.id);
    });

    title.append(meta);
    row.append(swatch, title, value, deleteButton);
    els.wallList.append(row);
  });
}

function setHoveredWallRun(wallId) {
  if (state.hoveredWallId === wallId) return;
  state.hoveredWallId = wallId;
  updateWallListHoverState();
  drawPlan();
}

function updateWallListHoverState() {
  els.wallList
    .querySelectorAll(".wall-row")
    .forEach((row) => row.classList.toggle("is-hovered", row.dataset.wallId === state.hoveredWallId));
}

function deleteWallRun(wallId) {
  if (!state.walls.some((wall) => wall.id === wallId)) return;
  pushHistory();
  state.walls = state.walls.filter((wall) => wall.id !== wallId);
  state.hoveredWallId = null;
  clearHoveredInterior();
  resetFpvToSpawn();
  renderAll();
}

function onGlobalKeyDown(event) {
  if (event.key !== "Delete" || shouldIgnoreGlobalDelete(event)) return;
  if (!state.hoveredWallId) return;
  event.preventDefault();
  deleteWallRun(state.hoveredWallId);
}

function shouldIgnoreGlobalDelete(event) {
  const target = event.target;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function renderBuildTime(boxCount) {
  const builders = getBuilderCount();
  const totalMinutes = boxCount / builders;
  els.totalBuildTime.textContent = formatMinutes(totalMinutes);
  els.boxBuildTime.textContent = formatMinutes(totalMinutes * 0.6);
  els.boxPositionTime.textContent = formatMinutes(totalMinutes * 0.4);
}

  Object.assign(app, { renderSummary, summarizeLayout, renderBreakdown, renderWallList, setHoveredWallRun, updateWallListHoverState, deleteWallRun, onGlobalKeyDown });
}

export { installSummaryView };
