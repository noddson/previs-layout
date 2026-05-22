const CURRENT_PLAN_VERSION = 1;

const DEFAULT_BOX_TYPES = [
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

const DEFAULT_CONFIG = {
  defaultWallHeight: 72,
  defaultGridSnap: 12,
  defaultBuilderCount: 1,
  defaultStageSize: {
    width: 480,
    depth: 360,
  },
};

const THREE_MODULE_URL = "./vendor/three/build/three.module.js";
const VR_BUTTON_MODULE_URL = "./vendor/three/examples/jsm/webxr/VRButton.js";
const DEMO_PLAN_PATH = "demo.json";
const INCH_TO_METER = 0.0254;
const BOX_EDGE_COLOR = 0x000000;
const MAX_IMPORTED_FILE_BYTES = 1_000_000;
const MAX_BOX_TYPES = 50;
const MAX_WALLS = 2000;
const MAX_REMOVED_BLOCKS = 2000;
const MAX_STRING_LENGTH = 80;
const MAX_BOX_DIMENSION = 2400;
const MAX_STAGE_SIZE = 2400;
const XR_THUMBSTICK_DEADZONE = 0.15;
const XR_TURN_DEGREES_PER_SECOND = 120;
const INTERIOR_HOVER_DELAY_MS = 1500;
const GEOMETRY_EPSILON = 0.001;
const MAX_INTERIOR_EDGE_CANDIDATES = 10;
const MAX_INTERIOR_SIDE_MISSING_RATIO = 0.4;

async function fetchJson(path, { fallbackMessage } = {}) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(fallbackMessage || `Using built-in defaults because ${path} could not be loaded.`, error);
    return null;
  }
}

function normalizeBoxes(source, { strict = false } = {}) {
  const candidates = Array.isArray(source) ? source : source?.boxes;
  const boxes = [];
  const ids = new Set();

  if (strict && !Array.isArray(candidates)) {
    throw new Error("Plan import failed: missing boxTypes array.");
  }
  if (strict && candidates.length > MAX_BOX_TYPES) {
    throw new Error(`Plan import failed: more than ${MAX_BOX_TYPES} box types.`);
  }

  (Array.isArray(candidates) ? candidates.slice(0, MAX_BOX_TYPES) : DEFAULT_BOX_TYPES).forEach((box, index) => {
    const id = normalizeIdentifier(box?.id, `box-${index + 1}`, strict);
    const name = normalizePlainText(box?.name, id, strict);
    const length = Number(box?.length);
    const depth = Number(box?.depth);
    const height = Number(box?.height);
    if (!id || ids.has(id) || !validDimension(length) || !validDimension(depth) || !validDimension(height)) {
      if (strict) throw new Error(`Plan import failed: invalid box type "${id || index + 1}".`);
      return;
    }
    ids.add(id);
    boxes.push({
      id,
      name,
      length,
      depth,
      height,
      cost: Math.max(0, Number(box?.cost) || 0),
      color: normalizeColor(box?.color, DEFAULT_BOX_TYPES[index % DEFAULT_BOX_TYPES.length].color),
    });
  });

  return boxes.length ? boxes : DEFAULT_BOX_TYPES.map((box) => ({ ...box }));
}

function normalizeIdentifier(value, fallback, strict = false) {
  const raw = normalizePlainText(value, fallback, strict);
  const id = raw.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (id) return id.slice(0, MAX_STRING_LENGTH);
  if (strict) throw new Error("Plan import failed: invalid box id.");
  return fallback;
}

function normalizePlainText(value, fallback, strict = false) {
  const text = String(value ?? fallback ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text && strict) throw new Error("Plan import failed: missing required text value.");
  return (text || fallback || "").slice(0, MAX_STRING_LENGTH);
}

function validDimension(value) {
  return Number.isFinite(value) && value > 0 && value <= MAX_BOX_DIMENSION;
}

function normalizeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeConfig(source) {
  const stage = source?.defaultStageSize || source?.stage || {};
  return {
    defaultWallHeight: clamp(Number(source?.defaultWallHeight ?? source?.wallHeight) || DEFAULT_CONFIG.defaultWallHeight, 12, 360),
    defaultGridSnap: clamp(Number(source?.defaultGridSnap ?? source?.gridSnap) || DEFAULT_CONFIG.defaultGridSnap, 3, 96),
    defaultBuilderCount: clamp(
      Math.round(
        Number(source?.defaultBuilderCount ?? source?.builderCount ?? source?.buildPersonCount) ||
          DEFAULT_CONFIG.defaultBuilderCount,
      ),
      1,
      99,
    ),
    defaultStageSize: {
      width: clamp(Number(stage.width) || DEFAULT_CONFIG.defaultStageSize.width, 96, MAX_STAGE_SIZE),
      depth: clamp(Number(stage.depth) || DEFAULT_CONFIG.defaultStageSize.depth, 96, MAX_STAGE_SIZE),
    },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRemovedBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const indexes = blocks
    .slice(0, MAX_REMOVED_BLOCKS)
    .map((block) => {
      if (Number.isInteger(block)) return block;
      if (Number.isInteger(Number(block))) return Number(block);
      if (Number.isInteger(Number(block?.blockIndex))) return Number(block.blockIndex);
      return null;
    })
    .filter((index) => index !== null && index >= 0);
  return [...new Set(indexes)].sort((a, b) => a - b);
}

export {
  CURRENT_PLAN_VERSION, DEFAULT_BOX_TYPES, DEFAULT_CONFIG, THREE_MODULE_URL, VR_BUTTON_MODULE_URL, DEMO_PLAN_PATH, INCH_TO_METER, BOX_EDGE_COLOR, MAX_IMPORTED_FILE_BYTES, MAX_BOX_TYPES, MAX_WALLS, MAX_REMOVED_BLOCKS, MAX_STRING_LENGTH, MAX_BOX_DIMENSION, MAX_STAGE_SIZE, XR_THUMBSTICK_DEADZONE, XR_TURN_DEGREES_PER_SECOND, INTERIOR_HOVER_DELAY_MS, GEOMETRY_EPSILON, MAX_INTERIOR_EDGE_CANDIDATES, MAX_INTERIOR_SIDE_MISSING_RATIO,
  fetchJson, normalizeBoxes, normalizeIdentifier, normalizePlainText, validDimension, normalizeColor, normalizeConfig, clamp, normalizeRemovedBlocks,
};
