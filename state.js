function createInitialState() {
  return {
    tool: "wall", walls: [], history: [], costs: {}, drag: null, blockedReason: null, axisTargets: [], hoveredWallId: null,
    hoveredInterior: { timer: null, key: null, candidate: null, label: null },
    orbit: { yaw: 210, pitch: 340, zoom: 1, dragging: false, lastX: 0, lastY: 0 },
    fpv: { x: 48, z: 48, yaw: 0, pitch: 0, halfSize: 5, eyeHeight: 60, speed: 96, dragging: false, lastFrame: 0, keys: {}, rendererReady: false },
  };
}

function installState(app) {
  const { state } = app;
  const clearHoveredInterior = (...args) => app.clearHoveredInterior(...args);
  const resetFpvToSpawn = (...args) => app.resetFpvToSpawn(...args);
  const renderAll = (...args) => app.renderAll(...args);
  const normalizeRemovedBlocks = (...args) => app.normalizeRemovedBlocks(...args);

function pushHistory() {
  state.history.push(JSON.stringify(state.walls));
  if (state.history.length > 60) state.history.shift();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  clearHoveredInterior();
  state.walls = JSON.parse(previous);
  resetFpvToSpawn();
  renderAll();
}

function serializeWall(wall) {
  return {
    id: wall.id,
    x1: wall.x1,
    y1: wall.y1,
    x2: wall.x2,
    y2: wall.y2,
    height: wall.height,
    boxId: wall.boxId,
    removedBlocks: normalizeRemovedBlocks(wall.removedBlocks),
  };
}

function cloneWall(wall) {
  return {
    ...wall,
    removedBlocks: [...(wall.removedBlocks || [])],
  };
}

  Object.assign(app, { pushHistory, undo, serializeWall, cloneWall });
}

export { createInitialState, installState };
