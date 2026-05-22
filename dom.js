function getElements() {
  return {
    planCanvas: document.querySelector("#planCanvas"),
    previewCanvas: document.querySelector("#previewCanvas"),
    fpvCanvas: document.querySelector("#fpvCanvas"),
    boxType: document.querySelector("#boxType"),
    boxCost: document.querySelector("#boxCost"),
    wallHeight: document.querySelector("#wallHeight"),
    snapSize: document.querySelector("#snapSize"),
    stageWidth: document.querySelector("#stageWidth"),
    stageDepth: document.querySelector("#stageDepth"),
    builderCount: document.querySelector("#builderCount"),
    totalBuildTime: document.querySelector("#totalBuildTime"),
    boxBuildTime: document.querySelector("#boxBuildTime"),
    boxPositionTime: document.querySelector("#boxPositionTime"),
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
    fpvXrStatus: document.querySelector("#fpvXrStatus"),
    fpvVrButton: document.querySelector("#fpvVrButton"),
    undoButton: document.querySelector("#undoButton"),
    demoButton: document.querySelector("#demoButton"),
    clearButton: document.querySelector("#clearButton"),
    saveButton: document.querySelector("#saveButton"),
    importButton: document.querySelector("#importButton"),
    importFile: document.querySelector("#importFile"),
  };
}

function installDom(app) {
  app.els = getElements();
  app.planCtx = app.els.planCanvas.getContext("2d");
  app.previewCtx = app.els.previewCanvas.getContext("2d");
  Object.assign(app, { resizeCanvasToDisplay, roundRect, createTrashIcon, createEmptyState });
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

function createTrashIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4h8v2" }],
    ["path", { d: "M19 6l-1 14H6L5 6" }],
    ["path", { d: "M10 11v5" }],
    ["path", { d: "M14 11v5" }],
  ].forEach(([tag, attributes]) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    svg.append(element);
  });
  return svg;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

export { getElements, installDom, resizeCanvasToDisplay, roundRect, createTrashIcon, createEmptyState };
