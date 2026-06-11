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
  return Range2xMake(minX, minY, maxX-minX, maxY-minY);
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
  waitTime
}

export type {
  Axis,
  Range,
  Range2x,
}
