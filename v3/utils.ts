import { DebugLog } from "./debug";
import type { BoxTextMetrics } from "./ui/box";

type Range   = [number, number];
type Range2x = { min: Range; max: Range; }
function Range2xMake(minX: number, minY: number, maxX: number, maxY: number): Range2x {
  return {
    min: [minX, minY],
    max: [maxX, maxY]
  }
}

function Range2xIntersectPoint(a: Range2x, x: number, y: number) {
  return x >= a.min[0] && x < a.max[0] &&
         y >= a.min[1] && y < a.max[1];
}

function Range2xIntersect(a: Range2x, b: Range2x) {
  const minX = Math.max(a.min[0], b.min[0]); 
  const minY = Math.max(a.min[1], b.min[1]); 
  const maxX = Math.min(a.max[0], b.max[0]); 
  const maxY = Math.min(a.max[1], b.max[1]); 
  return Range2xMake(minX, minY, maxX, maxY);
}

const AxisX     = 0;
const AxisY     = 1;
const AxisCount = 2;
type Axis = number;

function getTime() {
  return performance.now(); 
}

async function waitTime(seconds: number, busyWait: boolean = false) {
  if (seconds < 0) { return; }
  const target_seconds = getTime() + seconds;

  let sleep_seconds = seconds;
  if (busyWait) { sleep_seconds -= seconds * 0.08; }
  await Bun.sleep(sleep_seconds);

  if (busyWait) {
    while (getTime() < target_seconds) {}
  }
}

function hasFlag(value: number, flag: number): boolean {
  return (value & flag) === flag;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

const MAX_LINE_WIDTH_CACHE                  = 4096;
const LINE_WIDTH_CACHE: Map<string, number> = new Map();
function measureText(text: string, maxWidth: number, wrap: boolean = true, result: BoxTextMetrics): BoxTextMetrics {
  if (text.length === 0) { return result; }
  result.size[0] = 0;
  result.size[1] = 0;
  result.lineBoundaries.length = 0;

  const shouldWrap = wrap && maxWidth > 0 && Number.isFinite(maxWidth);
  let   totalWidth = 0;
  for (let idx = 0; idx <= text.length;) {
    let lineEnd = text.indexOf("\n", idx);

    let line = "";
    if (lineEnd === -1) {
      line = text.slice(idx);
    } else {
      line = text.slice(idx, lineEnd);
    }

    let width = LINE_WIDTH_CACHE.get(line);
    if (width === undefined) {
      width = Bun.stringWidth(line);

      if (LINE_WIDTH_CACHE.size > MAX_LINE_WIDTH_CACHE) { LINE_WIDTH_CACHE.clear(); }
      LINE_WIDTH_CACHE.set(line, width);
    }

    result.size[0] = Math.max(result.size[0], width);
    totalWidth    += width;
    if (shouldWrap) {
      result.size[1] += Math.max(1, Math.ceil(width / maxWidth));
    } else {
      result.size[1] += 1;
    }

    result.lineBoundaries.push(width);

    if (lineEnd === -1) { break; }
    idx = lineEnd + 1;
  }

  if (result.lineBoundaries.length !== result.size[1]) {
    throw new Error("measureText");
  }

  result.totalWidth = totalWidth;
  // DebugLog(JSON.stringify(result));
  // DebugLog(String(maxWidth));

  return result;
}

const BOX_ID_CACHE: Map<string, number> = new Map();
const InitialFNV	= 2166136261;
const FNVMultiple = 16777619;
function hashText(text: string, seed: number = 1): number {
  if (text.length === 0) { return 0; } 

	const cached = BOX_ID_CACHE.get(text);
	if (cached) { return cached; }

	let hash = InitialFNV * seed;
	for(let i = 0; i < text.length; i++)
	{
		hash = hash ^ text.charCodeAt(i);
		hash = (hash * FNVMultiple) & 0xffffffffffff;
	}

	BOX_ID_CACHE.set(text, hash);
	return hash;
}

function splitText(text: string, width: number): string[] {
  const result: string[] = [];
  if (width > 0) {
    const split = text.split("\n");
    for (let idx = 0; idx < split.length; idx += 1) {
      const line = split[idx]!;
      if (line.length === 0) { result.push(""); continue; }

      let pos = 0;
      while (pos < line.length) {
        const remaining = line.length - pos;
        if (remaining <= width) { result.push(line.slice(pos)); break; }

        let end = pos + width;
        result.push(line.slice(pos, end));
        pos = end;
      }

    }
  }

  return result;
}
export {
  Range2xMake,
  Range2xIntersect,
  Range2xIntersectPoint,
  AxisX,
  AxisY,
  AxisCount,

  getTime,
  hasFlag,
  clamp,
  waitTime,

  measureText,
  splitText,
  hashText,
}

export type {
  Axis,
  Range,
  Range2x,
}
