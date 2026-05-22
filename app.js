import {
  CURRENT_PLAN_VERSION,
  DEFAULT_BOX_TYPES,
  DEFAULT_CONFIG,
  DEMO_PLAN_PATH,
  MAX_IMPORTED_FILE_BYTES,
  MAX_STAGE_SIZE,
  MAX_WALLS,
  clamp,
  fetchJson,
  normalizeBoxes,
  normalizeConfig,
  normalizePlainText,
  normalizeRemovedBlocks,
} from "./config.js";
import { installDom } from "./dom.js";
import { formatDateForFilename } from "./format.js";
import { installFpvView } from "./fpv-view.js";
import { installGeometry } from "./geometry.js";
import { installOrbitPreview } from "./orbit-preview.js";
import { installPlanView } from "./plan-view.js";
import { createInitialState, installState } from "./state.js";
import { installSummaryView } from "./summary-view.js";

let BOX_TYPES = DEFAULT_BOX_TYPES.map((box) => ({ ...box }));
let appConfig = { ...DEFAULT_CONFIG, defaultStageSize: { ...DEFAULT_CONFIG.defaultStageSize } };
let demoPlan = { config: null, selectedBoxId: null, walls: [] };

const app = {
  state: createInitialState(),
  get BOX_TYPES() {
    return BOX_TYPES;
  },
  set BOX_TYPES(value) {
    BOX_TYPES = value;
  },
  get appConfig() {
    return appConfig;
  },
  set appConfig(value) {
    appConfig = value;
  },
  clamp,
  normalizeRemovedBlocks,
};

installDom(app);
installState(app);
installGeometry(app);
installOrbitPreview(app);
installFpvView(app);
installPlanView(app);
installSummaryView(app);

Object.assign(app, {
  loadAppConfiguration,
  populateBoxOptions,
  applyDefaultConfig,
  bindEvents,
  getActiveBox,
  getBox,
  getStage,
  getSnap,
  getWallHeight,
  getBuilderCount,
  getActiveCost,
  getBoxCost,
  loadDemoPlan,
  parseDemoPlanJson,
  applyDemoLayout,
  savePlan,
  downloadJson,
  importSelectedPlan,
  parsePlanJson,
  upgradePlan,
  normalizeImportedWalls,
  finiteNumber,
  finiteNumberInRange,
  applyImportedPlan,
});

async function init() {
  await loadAppConfiguration();
  demoPlan = await loadDemoPlan();
  populateBoxOptions();
  applyDefaultConfig();
  bindEvents();
  applyDemoLayout();
  await app.initFpvRenderer();
  app.resetFpvToSpawn();
  app.renderAll();
}

async function loadAppConfiguration() {
  const [boxesJson, configJson] = await Promise.all([
    fetchJson("boxes.json"),
    fetchJson("config.json"),
  ]);
  BOX_TYPES = normalizeBoxes(boxesJson);
  appConfig = normalizeConfig(configJson);
  app.state.costs = Object.fromEntries(BOX_TYPES.map((box) => [box.id, box.cost]));
}

function populateBoxOptions(selectedId = BOX_TYPES[0].id) {
  app.els.boxType.replaceChildren();
  BOX_TYPES.forEach((box) => {
    const option = document.createElement("option");
    option.value = box.id;
    option.textContent = box.name;
    app.els.boxType.append(option);
  });
  app.els.boxType.value = BOX_TYPES.some((box) => box.id === selectedId) ? selectedId : BOX_TYPES[0].id;
  app.els.boxCost.value = getBoxCost(app.els.boxType.value);
}

function applyDefaultConfig() {
  app.els.wallHeight.value = appConfig.defaultWallHeight;
  app.els.snapSize.value = appConfig.defaultGridSnap;
  app.els.builderCount.value = appConfig.defaultBuilderCount;
  app.els.stageWidth.value = appConfig.defaultStageSize.width;
  app.els.stageDepth.value = appConfig.defaultStageSize.depth;
}

function bindEvents() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      app.state.tool = button.dataset.tool;
      app.clearHoveredInterior({ redraw: true });
      document
        .querySelectorAll("[data-tool]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      app.updatePlanCursor();
    });
  });

  app.els.boxType.addEventListener("change", () => {
    app.els.boxCost.value = getBoxCost(app.els.boxType.value);
    app.renderAll();
  });

  app.els.boxCost.addEventListener("input", () => {
    app.state.costs[app.els.boxType.value] = getActiveCost();
    app.renderAll();
  });

  [app.els.wallHeight, app.els.snapSize].forEach((input) =>
    input.addEventListener("input", app.renderAll),
  );
  app.els.builderCount.addEventListener("input", app.renderSummary);
  [app.els.stageWidth, app.els.stageDepth].forEach((input) =>
    input.addEventListener("input", () => {
      app.clearHoveredInterior();
      app.resetFpvToSpawn();
      app.renderAll();
    }),
  );

  app.els.undoButton.addEventListener("click", app.undo);
  app.els.demoButton.addEventListener("click", () => {
    app.pushHistory();
    app.state.blockedReason = null;
    app.clearHoveredInterior();
    applyDemoLayout();
    app.resetFpvToSpawn();
    app.renderAll();
  });
  app.els.clearButton.addEventListener("click", () => {
    app.pushHistory();
    app.state.blockedReason = null;
    app.clearHoveredInterior();
    app.state.walls = [];
    app.resetFpvToSpawn();
    app.renderAll();
  });
  app.els.saveButton.addEventListener("click", savePlan);
  app.els.importButton.addEventListener("click", () => {
    app.els.importFile.value = "";
    app.els.importFile.click();
  });
  app.els.importFile.addEventListener("change", importSelectedPlan);

  app.els.planCanvas.addEventListener("pointerdown", app.onPlanPointerDown);
  app.els.planCanvas.addEventListener("pointermove", app.onPlanPointerMove);
  app.els.planCanvas.addEventListener("pointerup", app.onPlanPointerUp);
  app.els.planCanvas.addEventListener("pointercancel", app.cancelPlanDrag);
  app.els.planCanvas.addEventListener("lostpointercapture", app.cancelPlanDrag);
  app.els.planCanvas.addEventListener("pointerleave", app.onPlanPointerLeave);

  app.els.previewCanvas.addEventListener("pointerdown", app.onPreviewPointerDown);
  app.els.previewCanvas.addEventListener("pointermove", app.onPreviewPointerMove);
  app.els.previewCanvas.addEventListener("pointerup", app.onPreviewPointerUp);
  app.els.previewCanvas.addEventListener("pointercancel", app.onPreviewPointerUp);
  app.els.previewCanvas.addEventListener("wheel", app.onPreviewWheel, { passive: false });

  app.els.fpvCanvas.addEventListener("pointerdown", app.onFpvPointerDown);
  app.els.fpvCanvas.addEventListener("pointermove", app.onFpvPointerMove);
  app.els.fpvCanvas.addEventListener("pointerup", app.onFpvPointerUp);
  app.els.fpvCanvas.addEventListener("pointercancel", app.onFpvPointerUp);
  document.addEventListener("pointerlockchange", app.updateFpvStatus);
  document.addEventListener("mousemove", app.onFpvMouseMove);
  window.addEventListener("keydown", app.onGlobalKeyDown);
  window.addEventListener("keydown", app.onFpvKeyDown);
  window.addEventListener("keyup", app.onFpvKeyUp);
  window.addEventListener("blur", app.clearFpvKeys);

  window.addEventListener("resize", app.renderAll);
}

function getActiveBox() {
  return BOX_TYPES.find((box) => box.id === app.els.boxType.value) || BOX_TYPES[0];
}

function getBox(id) {
  return BOX_TYPES.find((box) => box.id === id) || BOX_TYPES[0];
}

function getStage() {
  return {
    width: clamp(Number(app.els.stageWidth.value) || 480, 96, MAX_STAGE_SIZE),
    depth: clamp(Number(app.els.stageDepth.value) || 360, 96, MAX_STAGE_SIZE),
  };
}

function getSnap() {
  return clamp(Number(app.els.snapSize.value) || 12, 3, 96);
}

function getWallHeight() {
  return clamp(Number(app.els.wallHeight.value) || 72, 12, 360);
}

function getBuilderCount() {
  return clamp(Math.round(Number(app.els.builderCount.value) || DEFAULT_CONFIG.defaultBuilderCount), 1, 99);
}

function getActiveCost() {
  return Math.max(0, Number(app.els.boxCost.value) || 0);
}

function getBoxCost(boxId) {
  return Math.max(0, Number(app.state.costs[boxId]) || 0);
}

async function loadDemoPlan() {
  const source = await fetchJson(DEMO_PLAN_PATH, {
    fallbackMessage: `${DEMO_PLAN_PATH} could not be loaded; starting without a demo layout.`,
  });
  if (!source) return { config: null, selectedBoxId: null, walls: [] };

  try {
    return parseDemoPlanJson(source);
  } catch (error) {
    console.warn(`${DEMO_PLAN_PATH} could not be loaded as a demo layout.`, error);
    return { config: null, selectedBoxId: null, walls: [] };
  }
}

function parseDemoPlanJson(source) {
  const plan = upgradePlan(source);
  const boxIds = new Set(BOX_TYPES.map((box) => box.id));
  return {
    config: plan.config ? normalizeConfig(plan.config) : null,
    selectedBoxId: plan.selectedBoxId ? String(plan.selectedBoxId) : null,
    walls: normalizeImportedWalls(plan.walls, boxIds),
  };
}

function applyDemoLayout() {
  if (demoPlan.config) {
    appConfig = demoPlan.config;
    applyDefaultConfig();
  }
  if (demoPlan.selectedBoxId && BOX_TYPES.some((box) => box.id === demoPlan.selectedBoxId)) {
    app.els.boxType.value = demoPlan.selectedBoxId;
    app.els.boxCost.value = getBoxCost(app.els.boxType.value);
  }
  app.state.walls = demoPlan.walls.map(app.cloneWall);
}

function savePlan() {
  const savedAt = new Date();
  const plan = {
    version: CURRENT_PLAN_VERSION,
    app: "previs-layout",
    savedAt: savedAt.toISOString(),
    boxTypes: BOX_TYPES.map((box) => ({ ...box, cost: getBoxCost(box.id) })),
    selectedBoxId: app.els.boxType.value,
    config: {
      defaultWallHeight: getWallHeight(),
      defaultGridSnap: getSnap(),
      defaultBuilderCount: getBuilderCount(),
      defaultStageSize: getStage(),
    },
    walls: app.state.walls.map(app.serializeWall),
  };
  downloadJson(plan, `previs-layout-${formatDateForFilename(savedAt)}.json`);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importSelectedPlan(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    if (file.size > MAX_IMPORTED_FILE_BYTES) {
      throw new Error("Plan import failed: JSON file is too large.");
    }
    const plan = parsePlanJson(JSON.parse(await file.text()));
    app.pushHistory();
    applyImportedPlan(plan);
  } catch (error) {
    window.alert(error.message || "That plan JSON could not be imported.");
  } finally {
    event.target.value = "";
  }
}

function parsePlanJson(source) {
  const plan = upgradePlan(source);
  const importedBoxes = normalizeBoxes(plan.boxTypes || plan.boxes, { strict: true });
  const boxIds = new Set(importedBoxes.map((box) => box.id));
  const walls = normalizeImportedWalls(plan.walls, boxIds);

  return {
    boxTypes: importedBoxes,
    selectedBoxId: String(plan.selectedBoxId || importedBoxes[0].id),
    config: normalizeConfig({
      ...plan.config,
      defaultBuilderCount: plan.config?.defaultBuilderCount ?? plan.builderCount ?? plan.buildPersonCount,
    }),
    walls,
  };
}

function upgradePlan(source) {
  if (!source || typeof source !== "object") {
    throw new Error("Plan import failed: JSON root must be an object.");
  }
  if (source.version !== CURRENT_PLAN_VERSION) {
    throw new Error(`Plan import failed: version ${source.version || "unknown"} is not supported yet.`);
  }
  if (!Array.isArray(source.walls)) {
    throw new Error("Plan import failed: missing walls array.");
  }
  if (source.walls.length > MAX_WALLS) {
    throw new Error(`Plan import failed: more than ${MAX_WALLS} wall runs.`);
  }
  return source;
}

function normalizeImportedWalls(walls, boxIds) {
  return walls.map((wall) => {
    const boxId = String(wall?.boxId || "");
    if (!boxIds.has(boxId)) throw new Error(`Plan import failed: unknown box type "${boxId}".`);
    return {
      id: normalizePlainText(wall.id, `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      x1: finiteNumberInRange(wall.x1, "x1", 0, MAX_STAGE_SIZE),
      y1: finiteNumberInRange(wall.y1, "y1", 0, MAX_STAGE_SIZE),
      x2: finiteNumberInRange(wall.x2, "x2", 0, MAX_STAGE_SIZE),
      y2: finiteNumberInRange(wall.y2, "y2", 0, MAX_STAGE_SIZE),
      height: finiteNumberInRange(wall.height, "height", 12, 360),
      boxId,
      removedBlocks: normalizeRemovedBlocks(wall.removedBlocks),
    };
  });
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Plan import failed: invalid ${label}.`);
  return number;
}

function finiteNumberInRange(value, label, min, max) {
  const number = finiteNumber(value, label);
  if (number < min || number > max) throw new Error(`Plan import failed: ${label} is out of range.`);
  return number;
}

function applyImportedPlan(plan) {
  BOX_TYPES = plan.boxTypes;
  appConfig = plan.config;
  app.state.costs = Object.fromEntries(BOX_TYPES.map((box) => [box.id, box.cost]));
  populateBoxOptions(plan.selectedBoxId);
  applyDefaultConfig();
  if (BOX_TYPES.some((box) => box.id === plan.selectedBoxId)) app.els.boxType.value = plan.selectedBoxId;
  app.els.boxCost.value = getBoxCost(app.els.boxType.value);
  app.state.walls = plan.walls;
  app.state.blockedReason = null;
  app.clearHoveredInterior();
  app.resetFpvToSpawn();
  app.renderAll();
}

init().catch((error) => {
  console.error(error);
  if (app.els.fpvStatus) app.els.fpvStatus.textContent = "Startup error";
});
