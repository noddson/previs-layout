import { BOX_EDGE_COLOR, INCH_TO_METER, THREE_MODULE_URL, VR_BUTTON_MODULE_URL, XR_THUMBSTICK_DEADZONE, XR_TURN_DEGREES_PER_SECOND } from "./config.js";
import { formatDegrees } from "./format.js";

function installFpvView(app) {
  const { state, els } = app;
  let THREE = null, VRButton = null, fpvRenderer = null, fpvScene = null, fpvCamera = null, fpvRig = null, fpvBoxesGroup = null, fpvStageGroup = null, fpvVrButton = null;
  const getStage = (...args) => app.getStage(...args);
  const getSnap = (...args) => app.getSnap(...args);
  const clamp = (...args) => app.clamp(...args);
  const footprintOutOfBounds = (...args) => app.footprintOutOfBounds(...args);
  const rectsIntersect = (...args) => app.rectsIntersect(...args);
  const getPlacementFootprints = (...args) => app.getPlacementFootprints(...args);
  const generateBoxes = (...args) => app.generateBoxes(...args);

async function initFpvRenderer() {
  try {
    const [threeModule, vrButtonModule] = await Promise.all([
      import(THREE_MODULE_URL),
      import(VR_BUTTON_MODULE_URL),
    ]);
    THREE = threeModule;
    VRButton = vrButtonModule.VRButton;
  } catch (error) {
    state.fpv.rendererReady = false;
    els.fpvStatus.textContent = "WebXR unavailable";
    els.fpvReadout.textContent = "Three.js failed to load from CDN";
    return;
  }

  fpvScene = new THREE.Scene();
  fpvScene.background = new THREE.Color(0xdfeef4);

  fpvCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 200);
  fpvCamera.rotation.order = "YXZ";

  fpvRig = new THREE.Group();
  fpvRig.add(fpvCamera);
  fpvScene.add(fpvRig);

  fpvBoxesGroup = new THREE.Group();
  fpvStageGroup = new THREE.Group();
  fpvScene.add(fpvStageGroup);
  fpvScene.add(fpvBoxesGroup);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x87939d, 1.7);
  fpvScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(-4, 8, 5);
  fpvScene.add(keyLight);

  fpvRenderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: els.fpvCanvas,
  });
  fpvRenderer.xr.enabled = true;
  fpvRenderer.setPixelRatio(window.devicePixelRatio || 1);
  fpvRenderer.setClearColor(0xdfeef4, 1);
  fpvRenderer.setAnimationLoop(tickFpv);
  fpvRenderer.xr.addEventListener("sessionstart", updateFpvStatus);
  fpvRenderer.xr.addEventListener("sessionend", updateFpvStatus);

  await configureFpvVrButton();

  state.fpv.rendererReady = true;
  resizeFpvRenderer();
  updateFpvStatus();
}

function resizeFpvRenderer() {
  if (!fpvRenderer || !fpvCamera) return;
  const rect = els.fpvCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  fpvRenderer.setPixelRatio(window.devicePixelRatio || 1);
  fpvRenderer.setSize(width, height, false);
  fpvCamera.aspect = width / height;
  fpvCamera.updateProjectionMatrix();
}

function tickFpv(timestamp, frame) {
  if (!state.fpv.rendererReady) return;
  const previous = state.fpv.lastFrame || timestamp;
  const dt = Math.min(0.05, (timestamp - previous) / 1000);
  state.fpv.lastFrame = timestamp;

  syncFpvCamera();
  if (fpvRenderer.xr.isPresenting) {
    updateXrFpv(dt, frame);
  } else {
    updateDesktopFpv(dt);
  }

  syncFpvCamera();
  renderFpvFrame();
}

function updateDesktopFpv(dt) {
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
    moveX -= right.x;
    moveZ -= right.z;
  }
  if (keys.a) {
    moveX += right.x;
    moveZ += right.z;
  }

  const magnitude = Math.hypot(moveX, moveZ);
  if (!magnitude) return false;

  const step = state.fpv.speed * dt;
  tryMoveFpv((moveX / magnitude) * step, (moveZ / magnitude) * step);
  return true;
}

function updateXrFpv(dt) {
  const controls = getXrThumbstickControls();
  if (!controls) return false;

  let didUpdate = false;

  if (controls.turn && Math.abs(controls.turn.x) > XR_THUMBSTICK_DEADZONE) {
    state.fpv.yaw -= controls.turn.x * XR_TURN_DEGREES_PER_SECOND * dt;
    didUpdate = true;
  }

  if (controls.move && Math.hypot(controls.move.x, controls.move.y) > XR_THUMBSTICK_DEADZONE) {
    const xrDirection = new THREE.Vector3();
    fpvRenderer.xr.getCamera(fpvCamera).getWorldDirection(xrDirection);
    xrDirection.y = 0;
    if (xrDirection.lengthSq() >= 0.0001) {
      xrDirection.normalize();

      const xrRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), xrDirection).normalize();
      const moveRenderX = xrRight.x * controls.move.x + xrDirection.x * controls.move.y;
      const moveRenderZ = xrRight.z * controls.move.x + xrDirection.z * controls.move.y;
      const magnitude = Math.hypot(moveRenderX, moveRenderZ);
      if (magnitude) {
        const step = state.fpv.speed * dt;
        tryMoveFpv((moveRenderX / magnitude) * step, (moveRenderZ / magnitude) * step);
        didUpdate = true;
      }
    }
  }

  return didUpdate;
}

function getXrThumbstickControls() {
  if (!fpvRenderer?.xr.isPresenting) return null;
  const session = fpvRenderer.xr.getSession();
  if (!session) return null;

  const controls = {
    move: null,
    turn: null,
  };

  for (const source of session.inputSources) {
    const gamepad = source.gamepad;
    if (!gamepad?.axes?.length) continue;
    const axisPair = getGamepadThumbstickAxes(gamepad.axes);
    if (!axisPair) continue;
    if (source.handedness === "left") {
      controls.move = axisPair;
    } else if (source.handedness === "right") {
      controls.turn = axisPair;
    }
  }

  return controls.move || controls.turn ? controls : null;
}

function getGamepadThumbstickAxes(axes) {
  const primary = {
    x: axes[0] || 0,
    y: -(axes[1] || 0),
  };
  const secondary = {
    x: axes[2] || 0,
    y: -(axes[3] || 0),
  };
  return Math.hypot(secondary.x, secondary.y) > Math.hypot(primary.x, primary.y)
    ? secondary
    : primary;
}

function tryMoveFpv(dx, dz) {
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
  state.fpv.yaw -= dx * 0.12;
  state.fpv.pitch = clamp(state.fpv.pitch - dy * 0.1, -82, 82);
  syncFpvCamera();
  renderFpvFrame();
}

function updateFpvStatus() {
  if (!els.fpvStatus) return;
  if (document.pointerLockElement !== els.fpvCanvas) state.fpv.dragging = false;
  if (fpvRenderer?.xr.isPresenting) {
    els.fpvStatus.textContent = "VR active";
  } else {
    els.fpvStatus.textContent =
      document.pointerLockElement === els.fpvCanvas ? "Mouse look active" : "Ground locked";
  }
}

async function configureFpvVrButton() {
  if (!els.fpvXrStatus) return;
  els.fpvVrButton?.replaceChildren();

  if (!("xr" in navigator)) {
    els.fpvXrStatus.hidden = false;
    els.fpvXrStatus.textContent = window.isSecureContext ? "WebXR unavailable" : "WebXR needs HTTPS";
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!supported) {
      els.fpvXrStatus.hidden = false;
      els.fpvXrStatus.textContent = "VR not supported";
      return;
    }
  } catch {
    els.fpvXrStatus.hidden = false;
    els.fpvXrStatus.textContent = "VR not allowed";
    return;
  }

  els.fpvXrStatus.hidden = true;
  els.fpvXrStatus.textContent = "";
  if (VRButton && els.fpvVrButton) {
    fpvVrButton = VRButton.createButton(fpvRenderer);
    els.fpvVrButton.replaceChildren(fpvVrButton);
  }
}

function clearFpvKeys() {
  state.fpv.keys = {};
}

function rebuildFpvScene() {
  if (!state.fpv.rendererReady) return;
  clearThreeGroup(fpvBoxesGroup);
  clearThreeGroup(fpvStageGroup);

  const stage = getStage();
  const floorGeometry = new THREE.PlaneGeometry(toMeters(stage.width), toMeters(stage.depth));
  const floorMaterial = new THREE.MeshLambertMaterial({
    color: 0xd8e0e4,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(toMeters(stage.width / 2), 0, toMeters(stage.depth / 2));
  fpvStageGroup.add(floor);

  const grid = new THREE.GridHelper(
    Math.max(toMeters(stage.width), toMeters(stage.depth)),
    Math.max(2, Math.round(Math.max(stage.width, stage.depth) / 48)),
    0x7b8a93,
    0xb7c3cb,
  );
  grid.position.set(toMeters(stage.width / 2), 0.002, toMeters(stage.depth / 2));
  fpvStageGroup.add(grid);

  generateBoxes().forEach((box) => {
    const geometry = new THREE.BoxGeometry(toMeters(box.sx), toMeters(box.sy), toMeters(box.sz));
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(box.color) });
    const mesh = new THREE.Mesh(geometry, material);
    const position = new THREE.Vector3(toMeters(box.cx), toMeters(box.cy), toMeters(box.cz));
    mesh.position.copy(position);
    fpvBoxesGroup.add(mesh);
    fpvBoxesGroup.add(createBoxEdgeOutline(geometry, position));
  });
}

function clearThreeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    disposeThreeObject(child);
  }
}

function createBoxEdgeOutline(boxGeometry, position) {
  const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
  const material = new THREE.LineBasicMaterial({
    color: BOX_EDGE_COLOR,
  });
  const outline = new THREE.LineSegments(edgesGeometry, material);
  outline.position.copy(position);
  outline.frustumCulled = false;
  outline.renderOrder = 1;
  return outline;
}

function disposeThreeObject(object) {
  object.children.forEach(disposeThreeObject);
  object.geometry?.dispose?.();
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((material) => material?.dispose?.());
}

function syncFpvCamera() {
  if (!state.fpv.rendererReady) return;
  fpvRig.position.set(toMeters(state.fpv.x), 0, toMeters(state.fpv.z));
  fpvRig.rotation.set(0, Math.PI + (state.fpv.yaw * Math.PI) / 180, 0);
  fpvCamera.position.set(0, toMeters(state.fpv.eyeHeight), 0);
  if (fpvRenderer.xr.isPresenting) {
    fpvCamera.rotation.set(0, 0, 0);
  } else {
    fpvCamera.rotation.set((state.fpv.pitch * Math.PI) / 180, 0, 0);
  }
  updateFpvReadout();
}

function renderFpvFrame() {
  if (!state.fpv.rendererReady) return;
  syncFpvCamera();
  fpvRenderer.render(fpvScene, fpvCamera);
}

function updateFpvReadout() {
  if (!els.fpvReadout) return;
  els.fpvReadout.textContent = `X ${Math.round(state.fpv.x)} in, Z ${Math.round(state.fpv.z)} in, yaw ${formatDegrees(state.fpv.yaw)}, pitch ${formatDegrees(state.fpv.pitch)}`;
}

function toMeters(inches) {
  return inches * INCH_TO_METER;
}

  Object.assign(app, { initFpvRenderer, resizeFpvRenderer, tickFpv, resetFpvToSpawn, clampFpvToStage, onFpvKeyDown, onFpvKeyUp, onFpvPointerDown, onFpvPointerMove, onFpvPointerUp, onFpvMouseMove, updateFpvStatus, clearFpvKeys, rebuildFpvScene, renderFpvFrame });
}

export { installFpvView };
