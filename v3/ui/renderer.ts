import { AxisX, getTime, hasFlag, hashText, measureText, waitTime } from "../utils";
import {
  colorFromKind,
  ColorKind_None,
  ColorKind_Primary,
  ColorKind_Text,
  colorValid,

  type Color,
  type ColorKind
} from "./color";

import {
  BoxFlags_DrawText,
  BoxFlags_TextWrap,
  BoxIdNone,
  BoxNode,

  calcLayout,

  sizeFixed,

  type BoxId,
  type BoxOpts,
} from "./box";

import {
  EventActionKind_Press,
  EventKind_Mouse,
  InputPoll,

  type Event,
} from "./input";
import { DebugLog } from "../debug";

const ANSI = {
  clear:           () => "\x1b[2J\x1b[H",
  reset:           () => "\x1b[0m",
  hideCursor:      () => "\x1b[?25l",
  showCursor:      () => "\x1b[?25h",

  enableMouse:     () => "\x1b[?1002h\x1b[?1006h",
  disableMouse:    () => "\x1b[?1002l\x1b[?1006l",

  enablePaste:     () => "\x1b[?2004h",
  disablePaste:    () => "\x1b[?2004l",

  enableKittyKbd:  () => "\x1b[>27u",
  disableKittyKbd: () => "\x1b[<u",
} as const;
const SEQ = {
  RESET:      new Uint8Array([0x1b,0x5b,0x30,0x6d]),                // \x1b[0m
  BOLD:       new Uint8Array([0x1b,0x5b,0x31,0x6d]),                // \x1b[1m
  DIM:        new Uint8Array([0x1b,0x5b,0x32,0x6d]),                // \x1b[2m
  ITALIC:     new Uint8Array([0x1b,0x5b,0x33,0x6d]),                // \x1b[3m
  UNDERLINE:  new Uint8Array([0x1b,0x5b,0x34,0x6d]),                // \x1b[4m
  BLINK:      new Uint8Array([0x1b,0x5b,0x35,0x6d]),                // \x1b[5m
  REVERSE:    new Uint8Array([0x1b,0x5b,0x37,0x6d]),                // \x1b[7m
  STRIKE:     new Uint8Array([0x1b,0x5b,0x39,0x6d]),                // \x1b[9m
  FG_DEFAULT: new Uint8Array([0x1b,0x5b,0x33,0x39,0x6d]),           // \x1b[39m
  BG_DEFAULT: new Uint8Array([0x1b,0x5b,0x34,0x39,0x6d]),           // \x1b[49m
} as const;
const CELL_STRIDE = 2;
const CellMask_Codepoint = 0x001FFFFF; // 0-20
const CellMask_Flags     = 0xFFE00000; //21-31
const CellFlags_AttrBold      = 1 << 21;
const CellFlags_AttrItalic    = 1 << 22;
const CellFlags_AttrUnderline = 1 << 23;
const CellFlags_AttrStrike    = 1 << 24;
const CellMask_Attrs = CellFlags_AttrBold
                     | CellFlags_AttrItalic
                     | CellFlags_AttrUnderline
                     | CellFlags_AttrStrike;
const CellFlags_BackgroundSet = 1 << 25;
const CellFlags_ForegroundSet = 1 << 26;
const CellFlags_Wide          = 1 << 27;
const CellFlags_WideTail      = 1 << 28;

let width:  number = process.stdout.columns ?? 80;
let height: number = process.stdout.rows    ?? 24;
let front:  Uint32Array;
let back:   Uint32Array;

let lastCursorX:    number = 0;
let lastCursorY:    number = 0;
let lastFlags:      number = 0;
let lastBackground: number = ColorKind_None;
let lastForeground: number = ColorKind_None;

let frameBegin: number = 0;

const BUFFER_CAPACITY = 1 << 20; // 1MB
const buffer = new Uint8Array(BUFFER_CAPACITY);
let   bufferPosition: number = 0;

function UiBufferFlush() {
  if (bufferPosition > 0) {
    process.stdout.write(buffer.subarray(0, bufferPosition));
    bufferPosition = 0;
  }
}
function UiBufferWriteByte(byte: number)   { buffer[bufferPosition++] = byte; }
function UiBufferWriteSeq(seq: Uint8Array) { buffer.set(seq, bufferPosition); bufferPosition += seq.length; }
function UiBufferWriteUint(n: number) {
  if (n < 10) {
    buffer[bufferPosition++] = 48 + n;
    return;
  }

  if (n < 100) {
    buffer[bufferPosition++] = 48 + (n / 10 | 0);
    buffer[bufferPosition++] = 48 + (n % 10);
    return;
  }

  if (n < 1000) {
    buffer[bufferPosition++] = 48 + (n / 100 | 0);
    buffer[bufferPosition++] = 48 + ((n / 10 | 0) % 10);
    buffer[bufferPosition++] = 48 + (n % 10);
    return;
  }
}
function UiBufferWriteCodepoint(codePoint: number) {
  if (codePoint < 0x80) {
    buffer[bufferPosition++] = codePoint;
  } else if (codePoint < 0x800) {
    buffer[bufferPosition++] = 0xC0 | (codePoint >> 6);
    buffer[bufferPosition++] = 0x80 | (codePoint &  0x3F);
  } else if (codePoint < 0x10000) {
    buffer[bufferPosition++] = 0xE0 | (codePoint  >> 12);
    buffer[bufferPosition++] = 0x80 | ((codePoint >> 6) & 0x3F);
    buffer[bufferPosition++] = 0x80 | (codePoint & 0x3F);
  } else {
    buffer[bufferPosition++] = 0xF0 | (codePoint  >> 18);
    buffer[bufferPosition++] = 0x80 | ((codePoint >> 12) & 0x3F);
    buffer[bufferPosition++] = 0x80 | ((codePoint >> 6)  & 0x3F);
    buffer[bufferPosition++] = 0x80 | (codePoint & 0x3F);
  }
}
function UiBufferWritePosition(x: number, y: number) {
  buffer[bufferPosition++]=0x1b; buffer[bufferPosition++]=0x5b; // ESC [
  UiBufferWriteUint(y + 1);
  buffer[bufferPosition++] = 0x3b;
  UiBufferWriteUint(x + 1);
  buffer[bufferPosition++] = 0x48;
}
function UiBufferWriteColorFG(color: Color) {
  buffer[bufferPosition++]=0x1b; buffer[bufferPosition++]=0x5b; // ESC [
  buffer[bufferPosition++]=0x33; buffer[bufferPosition++]=0x38; // 38
  buffer[bufferPosition++]=0x3b; buffer[bufferPosition++]=0x32; buffer[bufferPosition++]=0x3b; // ;2;
  UiBufferWriteUint(color.r); buffer[bufferPosition++]=0x3b;
  UiBufferWriteUint(color.g); buffer[bufferPosition++]=0x3b;
  UiBufferWriteUint(color.b); buffer[bufferPosition++]=0x6d; // m
}
function UiBufferWriteColorBG(color: Color) {
  buffer[bufferPosition++]=0x1b; buffer[bufferPosition++]=0x5b; // ESC [
  buffer[bufferPosition++]=0x34; buffer[bufferPosition++]=0x38; // 38
  buffer[bufferPosition++]=0x3b; buffer[bufferPosition++]=0x32; buffer[bufferPosition++]=0x3b; // ;2;
  UiBufferWriteUint(color.r); buffer[bufferPosition++]=0x3b;
  UiBufferWriteUint(color.g); buffer[bufferPosition++]=0x3b;
  UiBufferWriteUint(color.b); buffer[bufferPosition++]=0x6d; // m
}

function UiResize(newWidth: number, newHeight: number) {
  width  = newWidth;
  height = newHeight;
  front  = new Uint32Array(width * height * CELL_STRIDE);
  back   = new Uint32Array(width * height * CELL_STRIDE);
  back.fill(0xFFFFFFFF);

  UiState.root!.preferedSize[0].value = width;
  UiState.root!.preferedSize[1].value = height;
  UiState.root!.rect.max[0] = width;
  UiState.root!.rect.max[1] = height;
}
const TARGET_FPS        = 30;
const TARGET_FRAME_TIME = 1000/TARGET_FPS;
const UiState = {
  root: null as any as BoxNode,
  hot: 0 as BoxId,
  focused: 0 as BoxId,
  active: 0 as BoxId,

  cursor: { x: 0, y: 0 },
  BOX_CACHE:     new Map<BoxId, BoxNode>(),
  BOX_FREE_LIST: [] as Array<BoxNode>,
  UI_EVENTS:  [] as Array<Event>,

  frameDelta: TARGET_FRAME_TIME,
  elapsed:    0,
  frameCount: 0,
};

function UiInit() {
  UiState.root = Box("", { prefWidth: sizeFixed(width), prefHeight: sizeFixed(height) });
  UiState.root!.rect.max[0] = width;
  UiState.root!.rect.max[1] = height;

  front = new Uint32Array(width * height * CELL_STRIDE);
  back  = new Uint32Array(width * height * CELL_STRIDE);
  back.fill(0xFFFFFFFF);

  process.stdout.write(ANSI.clear());
  process.stdout.write(ANSI.hideCursor());
  process.stdout.write(ANSI.enableMouse());
  process.stdout.write(ANSI.enablePaste());
  process.stdout.write(ANSI.enableKittyKbd());

  if (process.stdout.isTTY) {
    process.stdout.on("resize", () => {
      const newWidth  = process.stdout.columns ?? 80;
      const newHeight = process.stdout.rows    ?? 24;

      UiResize(newWidth, newHeight);
    });
  }

  process.on("exit", () => { UiDeinit(); });
}

function UiDeinit() {
  process.stdout.write(ANSI.disableMouse());
  process.stdout.write(ANSI.disablePaste());
  process.stdout.write(ANSI.showCursor());
  process.stdout.write(ANSI.disableKittyKbd());
  process.stdout.write(ANSI.reset());
  process.stdout.write(ANSI.clear());
}


let lastRenderedCursorX = 0;
let lastRenderedCursorY = 0;
function UiFlush() {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (width * y + x) * CELL_STRIDE;

      const isCursorHere = (x === UiState.cursor.x && y === UiState.cursor.y);
      if (front[base] === back[base] && front[base+1] === back[base+1]) {
        if (!isCursorHere &&
            !(lastRenderedCursorX === x && lastRenderedCursorY === y)) {
          continue;
        }
      }

      const cell = front[base]!;
      if (isCursorHere) {
        const cursorBackground = ColorKind_Text;
        const cursorForeground = ColorKind_Primary;

        if (lastFlags !== 0) {
          buffer[bufferPosition++]=0x1b; buffer[bufferPosition++]=0x5b; // ESC [
          buffer[bufferPosition++]=0x30; buffer[bufferPosition++]=0x6d; // 0m
          lastFlags = 0;
        }

        UiBufferWritePosition(x, y);
        UiBufferWriteColorBG(colorFromKind(cursorBackground));
        UiBufferWriteColorFG(colorFromKind(cursorForeground));
        UiBufferWriteCodepoint(cell & CellMask_Codepoint);

        lastBackground = cursorBackground;
        lastForeground = cursorForeground;

        if (hasFlag(cell, CellFlags_Wide)) { lastCursorX = x + 2; }
        else                               { lastCursorX = x + 1; }
        lastCursorY = y;
        continue;
      }

      if (hasFlag(cell, CellFlags_WideTail)) { continue; }

      if (x !== lastCursorX || y !== lastCursorY) {
        UiBufferWritePosition(x, y);
      }


      let background = 0;
      if (hasFlag(cell, CellFlags_BackgroundSet)) {
        background = front[base+1]! & 0xFFFF;
      }
      let foreground = 0;
      if (hasFlag(cell, CellFlags_ForegroundSet)) {
        foreground = (front[base+1]! >>> 16) & 0xFFFF;
      }
      const attrs = cell & CellMask_Attrs;
      if ((lastFlags & ~attrs) !== 0) {
        buffer[bufferPosition++]=0x1b; buffer[bufferPosition++]=0x5b; // ESC [
        buffer[bufferPosition++]=0x30; buffer[bufferPosition++]=0x6d; // 0m
        lastFlags      = 0;
        lastBackground = 0;
        lastForeground = 0;
      }

      const setFlags = (attrs & ~lastFlags);
      if (setFlags) {
        if (setFlags & CellFlags_AttrBold)      { UiBufferWriteSeq(SEQ.BOLD);      }
        if (setFlags & CellFlags_AttrItalic)    { UiBufferWriteSeq(SEQ.ITALIC);    }
        if (setFlags & CellFlags_AttrUnderline) { UiBufferWriteSeq(SEQ.UNDERLINE); }
        if (setFlags & CellFlags_AttrStrike)    { UiBufferWriteSeq(SEQ.STRIKE);    }
        lastFlags = attrs;
      }

      if (background !== lastBackground) {
        if (background === ColorKind_None) {
          UiBufferWriteSeq(SEQ.BG_DEFAULT);
        } else {
          UiBufferWriteColorBG(colorFromKind(background as ColorKind));
        }
        lastBackground = background;
      }
      if (foreground !== lastForeground) {
        if (foreground === ColorKind_None) {
          UiBufferWriteSeq(SEQ.FG_DEFAULT);
        } else {
          UiBufferWriteColorFG(colorFromKind(foreground as ColorKind));
        }
        lastForeground = foreground;
      }

      UiBufferWriteCodepoint(cell & CellMask_Codepoint);
      if (hasFlag(cell, CellFlags_Wide)) {
        lastCursorX = x + 2;
      } else {
        lastCursorX = x + 1;
      }
      lastCursorY = y;
    }
  }

  UiBufferFlush();

  lastRenderedCursorX = UiState.cursor.x;
  lastRenderedCursorY = UiState.cursor.y;

  const tmp = back;
  back  = front;
  front = tmp
}

function UiSetCell(x: number, y: number,
                   codepoint:  number,
                   flags:      number,
                   background: number,
                   foreground: number) {
  const base = (width * y + x) * CELL_STRIDE;
  let   cell = (codepoint & CellMask_Codepoint) | (flags & CellMask_Flags);

  let color = 0;
  if (colorValid(background)) {
    cell  |= CellFlags_BackgroundSet;
    color |= background & 0xFFFF;
  }
  if (colorValid(foreground)) {
    cell  |= CellFlags_ForegroundSet;
    color |= (foreground & 0xFFFF) << 16;
  }

  front[base]   = cell;
  front[base+1] = color;
}

function UiClearScreen() {
  const size = width * height;
  for (let idx = 0; idx < size; idx += 1) {
    front[idx * CELL_STRIDE]     = 0x20;
    front[idx * CELL_STRIDE + 1] = 0;
  }
}

function UiRender(box: BoxNode) {
  if (box.id !== BoxIdNone && UiState.BOX_CACHE.has(box.id)) {
    box.render();
  }

  for (const node of box.children) {
    UiRender(node);
  }
}

function UiBeginFrame() {
  UiState.frameCount += 1;
  frameBegin          = getTime();

  const events = InputPoll();
  let   count  = events.length; 
  for (let idx = 0; idx < count; idx += 1) {
    const event = events[idx]!;
    if (event.kind   === EventKind_Mouse       &&
        event.action === EventActionKind_Press &&
        event.name   === "left") {

      UiState.cursor.x = event.mouseX;
      UiState.cursor.y = event.mouseY;
    }

    UiState.UI_EVENTS.push(event);
  }
  UiClearScreen();
}

async function UiEndFrame() {
  calcLayout(UiState.root);
  UiRender(UiState.root);
  UiFlush();
  let frameEnd = getTime();

  UiState.frameDelta = frameEnd - frameBegin;
  if (UiState.frameDelta < TARGET_FRAME_TIME) {
    const sleepTime = TARGET_FRAME_TIME - UiState.frameDelta;
    await waitTime(sleepTime);
    frameEnd = getTime();
    UiState.frameDelta = frameEnd - frameBegin;
  }

  UiState.elapsed += UiState.frameDelta;
  for (const box of UiState.BOX_CACHE.values()) {
    if (box.lastRenderedFrame < UiState.frameCount) {
      UiState.BOX_CACHE.delete(box.id);
      UiState.BOX_FREE_LIST.push(box);
    }
  }
  UiState.root.children.length = 0;
  UiState.UI_EVENTS.length     = 0;
}

function BoxFromCache(id: BoxId) { return UiState.BOX_CACHE.get(id) ?? null; }

function Box(hash: string, opts?: BoxOpts) {
  const id  = hashText(hash);
  let   box = BoxFromCache(id);

  const boxIsFirstFrame = box === null;
  const boxIsTransient  = id  === BoxIdNone;
  if (boxIsFirstFrame) {
    if (!boxIsTransient && UiState.BOX_FREE_LIST.length) {
      box = UiState.BOX_FREE_LIST.pop()!;
      box.reset();
    } else { box = new BoxNode(); }
  }

  if (boxIsFirstFrame && !boxIsTransient) {
    UiState.BOX_CACHE.set(id, box!);
  }

  box!.id         = id;
  box!.flags      = opts?.flags      ?? 0;
  box!.background = opts?.background ?? 0;
  box!.foreground = opts?.foreground ?? 0;
  box!.layoutAxis = opts?.layoutAxis ?? AxisX;

  box!.maxFixedSize[0] = opts?.maxFixedWidth  ?? Number.MAX_SAFE_INTEGER;
  box!.maxFixedSize[1] = opts?.maxFixedHeight ?? Number.MAX_SAFE_INTEGER;

  if (opts) {
    let textDirty = false; 
    if (opts.text !== undefined && opts.text !== box!.rawText) {
      textDirty    = true;
      box!.rawText = opts.text;
    }


    if (hasFlag(box!.flags, BoxFlags_DrawText) && box!.rawText !== null &&
        (boxIsFirstFrame || textDirty || box!.lastTextMetricsWrapWidth !== box!.fixedSize[0])) {
      let   text       = box!.rawText;
      const shouldWrap = hasFlag(box!.flags, BoxFlags_TextWrap); 
      if (shouldWrap) {
        box!.wrappedText = Bun.wrapAnsi(text, box!.fixedSize[0], {
          hard: true,
          trim: false
        });

        text = box!.wrappedText;
      }

      box!.textMetrics              = measureText(text, box!.fixedSize[0], shouldWrap, box!.textMetrics);
      box!.lastTextMetricsWrapWidth = box!.fixedSize[0];
    }

    if (opts.prefWidth !== undefined) {
      box!.preferedSize[0].minKeepRatio = opts.prefWidth.minKeepRatio;
      box!.preferedSize[0].kind         = opts.prefWidth.kind;
      box!.preferedSize[0].value        = opts.prefWidth.value;
    }

    if (opts.prefHeight !== undefined) {
      box!.preferedSize[1].minKeepRatio = opts.prefHeight.minKeepRatio;
      box!.preferedSize[1].kind         = opts.prefHeight.kind;
      box!.preferedSize[1].value        = opts.prefHeight.value;
    }
  }

  box!.children.length   = 0;
  box!.parent            = null;
  box!.lastRenderedFrame = UiState.frameCount;
  return box!;
}

export {
  UiBeginFrame,
  UiEndFrame,
  UiSetCell,
  UiInit,
  Box,

  UiState,
}
