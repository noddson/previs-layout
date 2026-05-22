import { GEOMETRY_EPSILON, MAX_INTERIOR_EDGE_CANDIDATES, MAX_INTERIOR_SIDE_MISSING_RATIO } from "./config.js";

function installGeometry(app) {
  const { state } = app;
  const clamp = (...args) => app.clamp(...args);
  const getActiveBox = (...args) => app.getActiveBox(...args);
  const getBox = (...args) => app.getBox(...args);
  const getStage = (...args) => app.getStage(...args);
  const getSnap = (...args) => app.getSnap(...args);
  const getWallHeight = (...args) => app.getWallHeight(...args);
  const getBoxCost = (...args) => app.getBoxCost(...args);
  const normalizeRemovedBlocks = (...args) => app.normalizeRemovedBlocks(...args);
  const cloneWall = (...args) => app.cloneWall(...args);

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

function getDraggedWall(drag) {
  const dx = drag.current.x - drag.start.x;
  const dy = drag.current.y - drag.start.y;
  return moveWallBy(drag.originalWall, dx, dy);
}

function moveWallBy(wall, dx, dy) {
  const moved = {
    ...cloneWall(wall),
    x1: wall.x1 + dx,
    y1: wall.y1 + dy,
    x2: wall.x2 + dx,
    y2: wall.y2 + dy,
  };
  return moved;
}

function wallMoved(a, b) {
  return a.x1 !== b.x1 || a.y1 !== b.y1 || a.x2 !== b.x2 || a.y2 !== b.y2;
}

function buildWallsFromDrag(start, end, { includeRoomLabel = false } = {}) {
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

    const interiorWidth = Math.max(0, width - box.depth * 2);
    const walls = [
      makeWall(x1, y1, x2, y1, height, box.id),
      makeWall(sideX, sideY, sideX, bottomY, height, box.id),
      makeWall(x1, bottomY, x2, bottomY, height, box.id),
      makeWall(x1, sideY, x1, bottomY, height, box.id),
    ];
    if (includeRoomLabel) {
      walls[0].roomLabel = {
        x: x1 + box.depth + interiorWidth / 2,
        y: sideY + interiorDepth / 2,
        width: interiorWidth,
        depth: interiorDepth,
      };
    }
    return walls;
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
  for (let i = state.walls.length - 1; i >= 0; i -= 1) {
    const wall = state.walls[i];
    const footprint = generateFootprints(wall).find((item) => pointInFootprint(point, item));
    if (footprint) return { wall, blockIndex: footprint.blockIndex };
  }
  return null;
}

function generateFootprints(wall) {
  const box = getBox(wall.boxId);
  const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  const count = getWallColumnCapacity(wall, box);
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

function eraseBlock(hit) {
  const removed = new Set(hit.wall.removedBlocks || []);
  removed.add(hit.blockIndex);
  hit.wall.removedBlocks = [...removed];
  if (!generateFootprints(hit.wall).length) {
    state.walls = state.walls.filter((wall) => wall.id !== hit.wall.id);
  } else {
    trimRemovedWallEnds(hit.wall);
  }
}

function trimRemovedWallEnds(wall) {
  const box = getBox(wall.boxId);
  const count = getWallColumnCapacity(wall, box);
  const removed = new Set(normalizeRemovedBlocks(wall.removedBlocks).filter((index) => index < count));
  let startTrim = 0;
  let endTrim = 0;

  while (startTrim < count && removed.has(startTrim)) startTrim += 1;
  while (endTrim < count - startTrim && removed.has(count - endTrim - 1)) endTrim += 1;
  if (!startTrim && !endTrim) {
    wall.removedBlocks = [...removed];
    return;
  }

  const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  const direction = horizontal ? Math.sign(wall.x2 - wall.x1) || 1 : Math.sign(wall.y2 - wall.y1) || 1;
  if (horizontal) {
    wall.x1 += direction * startTrim * box.length;
    wall.x2 -= direction * endTrim * box.length;
  } else {
    wall.y1 += direction * startTrim * box.length;
    wall.y2 -= direction * endTrim * box.length;
  }

  const firstKept = startTrim;
  const lastKept = count - endTrim - 1;
  wall.removedBlocks = [...removed]
    .filter((index) => index >= firstKept && index <= lastKept)
    .map((index) => index - firstKept);
}

function getWallRunLength(wall) {
  const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  return horizontal ? Math.abs(wall.x2 - wall.x1) : Math.abs(wall.y2 - wall.y1);
}

function getWallColumnCapacity(wall, box = getBox(wall.boxId)) {
  return Math.max(1, Math.ceil(getWallRunLength(wall) / box.length));
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

function findInteriorAt(point) {
  const footprints = getPlacementFootprints(state.walls);
  if (footprints.some((footprint) => pointInRect(point, footprint.rect))) return null;

  const leftEdges = nearestEdgeCandidates(
    footprints.map((footprint) => footprint.rect.right).filter((edge) => edge < point.x - GEOMETRY_EPSILON),
    point.x,
  );
  const rightEdges = nearestEdgeCandidates(
    footprints.map((footprint) => footprint.rect.left).filter((edge) => edge > point.x + GEOMETRY_EPSILON),
    point.x,
  );
  const topEdges = nearestEdgeCandidates(
    footprints.map((footprint) => footprint.rect.bottom).filter((edge) => edge < point.y - GEOMETRY_EPSILON),
    point.y,
  );
  const bottomEdges = nearestEdgeCandidates(
    footprints.map((footprint) => footprint.rect.top).filter((edge) => edge > point.y + GEOMETRY_EPSILON),
    point.y,
  );

  let best = null;
  let bestArea = Infinity;
  for (const left of leftEdges) {
    for (const right of rightEdges) {
      if (right <= left + GEOMETRY_EPSILON) continue;
      for (const top of topEdges) {
        for (const bottom of bottomEdges) {
          if (bottom <= top + GEOMETRY_EPSILON) continue;
          const candidate = { left, right, top, bottom };
          const area = (right - left) * (bottom - top);
          if (area >= bestArea) continue;
          if (validInteriorCandidate(candidate, footprints)) {
            best = candidate;
            bestArea = area;
          }
        }
      }
    }
  }
  return best;
}

function nearestEdgeCandidates(values, target) {
  const unique = [...new Set(values.map((value) => Math.round(value * 1000) / 1000))];
  return unique
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    .slice(0, MAX_INTERIOR_EDGE_CANDIDATES);
}

function validInteriorCandidate(candidate, footprints) {
  const stage = getStage();
  if (footprintOutOfBounds(candidate, stage)) return false;
  if (footprints.some((footprint) => rectsIntersect(candidate, footprint.rect))) return false;
  return (
    hasCoveredInteriorSide(candidate, footprints, "top") &&
    hasCoveredInteriorSide(candidate, footprints, "right") &&
    hasCoveredInteriorSide(candidate, footprints, "bottom") &&
    hasCoveredInteriorSide(candidate, footprints, "left")
  );
}

function hasCoveredInteriorSide(candidate, footprints, side) {
  const horizontal = side === "top" || side === "bottom";
  const target =
    side === "top"
      ? candidate.top
      : side === "bottom"
        ? candidate.bottom
        : side === "left"
          ? candidate.left
          : candidate.right;
  const start = horizontal ? candidate.left : candidate.top;
  const end = horizontal ? candidate.right : candidate.bottom;
  const intervals = [];

  footprints.forEach((footprint) => {
    const rect = footprint.rect;
    if (side === "top" && approximatelyEqual(rect.bottom, target)) {
      addClippedInterval(intervals, rect.left, rect.right, start, end);
    } else if (side === "bottom" && approximatelyEqual(rect.top, target)) {
      addClippedInterval(intervals, rect.left, rect.right, start, end);
    } else if (side === "left" && approximatelyEqual(rect.right, target)) {
      addClippedInterval(intervals, rect.top, rect.bottom, start, end);
    } else if (side === "right" && approximatelyEqual(rect.left, target)) {
      addClippedInterval(intervals, rect.top, rect.bottom, start, end);
    }
  });

  return intervalsCoverEnoughSlots(intervals, start, end);
}

function addClippedInterval(intervals, intervalStart, intervalEnd, rangeStart, rangeEnd) {
  const start = Math.max(intervalStart, rangeStart);
  const end = Math.min(intervalEnd, rangeEnd);
  if (end > start + GEOMETRY_EPSILON) intervals.push({ start, end });
}

function intervalsCoverEnoughSlots(intervals, start, end) {
  const blockUnit = inferInteriorSideBlockUnit(intervals);
  if (!blockUnit) return false;

  const sideLength = end - start;
  const expectedSlots = Math.floor((sideLength + GEOMETRY_EPSILON) / blockUnit);
  if (expectedSlots < 1) return false;

  const coveredSlots = new Set();
  for (let index = 0; index < expectedSlots; index += 1) {
    const slotStart = start + index * blockUnit;
    const slotEnd = slotStart + blockUnit;
    if (intervals.some((interval) => intervalCoversSlot(interval, slotStart, slotEnd))) {
      coveredSlots.add(index);
    }
  }

  const missingSlots = expectedSlots - coveredSlots.size;
  const maxMissingSlots = Math.floor(expectedSlots * MAX_INTERIOR_SIDE_MISSING_RATIO);
  return missingSlots <= maxMissingSlots;
}

function inferInteriorSideBlockUnit(intervals) {
  const lengths = intervals
    .map((interval) => interval.end - interval.start)
    .filter((length) => length > GEOMETRY_EPSILON)
    .sort((a, b) => a - b);
  return lengths[0] || null;
}

function intervalCoversSlot(interval, slotStart, slotEnd) {
  const overlap = Math.min(interval.end, slotEnd) - Math.max(interval.start, slotStart);
  return overlap >= (slotEnd - slotStart) / 2 - GEOMETRY_EPSILON;
}

function approximatelyEqual(a, b) {
  return Math.abs(a - b) <= GEOMETRY_EPSILON;
}

function pointInRect(point, rect) {
  return (
    point.x > rect.left + GEOMETRY_EPSILON &&
    point.x < rect.right - GEOMETRY_EPSILON &&
    point.y > rect.top + GEOMETRY_EPSILON &&
    point.y < rect.bottom - GEOMETRY_EPSILON
  );
}

function validatePlacement(newWalls, { ignoreWallIds = new Set() } = {}) {
  if (!newWalls.length) return { ok: true, reason: null };
  const newFootprints = getPlacementFootprints(newWalls);
  const existingFootprints = getPlacementFootprints(
    state.walls.filter((wall) => !ignoreWallIds.has(wall.id)),
  );
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
  const fullColumns = getWallColumnCapacity(wall, box);
  const rawLength = getWallRunLength(wall);
  const fullLength = fullColumns * box.length;
  const layers = Math.max(1, Math.ceil(wall.height / box.height));
  return {
    length: fullLength,
    rawLength,
    fullLength,
    columns,
    fullColumns,
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

  Object.assign(app, { makeWall, getDraggedWall, moveWallBy, wallMoved, buildWallsFromDrag, findBlockAt, eraseBlock, generateFootprints, getWallRunLength, getWallColumnCapacity, pointInFootprint, getPlacementFootprints, findInteriorAt, validatePlacement, footprintOutOfBounds, rectsIntersect, getWallMetrics, generateBoxes });
}

export { installGeometry };
