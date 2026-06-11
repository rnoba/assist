import {
    AxisCount,
  AxisX, AxisY,
  clamp,
  hasFlag,
  Range2xIntersect,
  Range2xMake,

  type Axis,
  type Range2x
} from "../utils";
import { ColorKind_None, type ColorKind } from "./color";
import { UiSetCell } from "./renderer";

const BoxFlags_FloatingX        = 1 << 0;
const BoxFlags_FloatingY        = 1 << 1;
const BoxFlags_AllowOverflowX   = 1 << 2;
const BoxFlags_AllowOverflowY   = 1 << 3;
const BoxFlags_DrawText         = 1 << 4;
const BoxFlags_DrawBackground   = 1 << 5;
const BoxFlags_ScrollView       = 1 << 6;
const BoxFlags_ScrollX          = 1 << 7;
const BoxFlags_ScrollY          = 1 << 8;
const BoxFlags_Clickable        = 1 << 9;
const BoxFlags_ViewClamp        = 1 << 10;
const BoxFlags_DrawTopBorder    = 1 << 11;
const BoxFlags_DrawRightBorder  = 1 << 12;
const BoxFlags_DrawBottomBorder = 1 << 13;
const BoxFlags_DrawLeftBorder   = 1 << 14;

const BoxFlags_TextAlignCenterX = 1 << 15;
const BoxFlags_TextAlignCenterY = 1 << 16;
const BoxFlags_TextAlignCenter  = BoxFlags_TextAlignCenterX|BoxFlags_TextAlignCenterY;
const BoxFlags_TextAlignLeft    = 1 << 17;
const BoxFlags_TextAlignRight   = 1 << 18;

type BoxSizeKind = number;
type BoxSize     = { kind: BoxSizeKind; value: number; minKeepRatio: number; }
const BoxSizeKind_Fixed         = 0;
const BoxSizeKind_ParentPercent = 1;
const BoxSizeKind_TextContent   = 2;
const BoxSizeKind_FitContent    = 3;
function BoxSizeMake(kind: BoxSizeKind, value = 0, minKeepRatio = 0): BoxSize {
  return { kind, value, minKeepRatio };
}
function sizeFixed(value = 0, minKeepRatio = 0) {
  return BoxSizeMake(BoxSizeKind_Fixed, value, minKeepRatio);
}
function sizeParentPct(value = 0, minKeepRatio = 0) {
  return BoxSizeMake(BoxSizeKind_ParentPercent, value, minKeepRatio);
}
function sizeFitContent(value = 0, minKeepRatio = 0) {
  return BoxSizeMake(BoxSizeKind_FitContent, value, minKeepRatio);
}
function sizeText(value = 0, minKeepRatio = 0) {
  return BoxSizeMake(BoxSizeKind_TextContent, value, minKeepRatio);
}


type BoxOpts = {
  flags?:      number;
  background?: number;
  foreground?: number;

  text?:       string;
  layoutAxis?: Axis;

  size?:    [BoxSize, BoxSize];
};

type BoxId             = number;
const BoxIdNone: BoxId = 0;
class BoxNode {
  id:      BoxId         = BoxIdNone;
  text:    string | null = null;
  rawText: string | null = null;
  textDirty:    boolean = false;
  wrappedWidth: number = -1;

  flags:        number = 0;

  rect: Range2x = Range2xMake(0, 0, 0, 0);
  fixedPosition: [number, number] = [0, 0];
  fixedSize:     [number, number] = [0, 0];
  viewOffset:    [number, number] = [0, 0];
  viewBounds:    [number, number] = [0, 0];
  buffer:        string[]         = [];

  layoutAxis: Axis = AxisX;

  parent: BoxNode | null = null;

  children:      BoxNode[] = [];
  preferedSize: [BoxSize, BoxSize] = [sizeFitContent(), sizeFitContent()];

  background: number = ColorKind_None;
  foreground: number = ColorKind_None;
  cellFlags:  number = 0;
  lastRenderedFrame: number = -1;

  render() {
    if (this.id !== BoxIdNone) {

      let rect: Range2x | null = this.rect;
      for (let parent = this.parent; parent !== null; parent = parent.parent) {
        rect = Range2xIntersect(rect, parent.rect);
      }

      const baseX      = rect.min[0];
      const baseY      = rect.min[1];
      const baseWidth  = rect.max[0] - baseX;
      const baseHeight = rect.max[1] - baseY;
      if (baseWidth <= 0 || baseHeight <= 0) { return; }

      if (hasFlag(this.flags, BoxFlags_DrawBackground)) {
        for (let y = 0; y < baseHeight; y += 1) {
          for (let x = 0; x < baseWidth; x += 1) {
            UiSetCell(baseX + x, baseY + y, 0x20,
                      this.cellFlags,
                      this.background,
                      this.foreground);
          }
        }
      }

      if (hasFlag(this.flags, BoxFlags_DrawText) && this.buffer.length > 0) {
        const parentMinX = this.parent?.rect.min[0] ?? 0;
        const parentMinY = this.parent?.rect.min[1] ?? 0;
        const parentMaxX = this.parent?.rect.max[0] ?? baseX + baseWidth;
        const parentMaxY = this.parent?.rect.max[1] ?? baseX + baseWidth;

        const clipX0 = Math.max(0, parentMinX);
        const clipY0 = Math.max(0, parentMinY);

        const xStart = Math.max(0, clipX0 - baseX);
        const yStart = Math.max(0, clipY0 - baseY);
        for (let y = yStart; y < this.buffer.length; y += 1) {
          const screenY = y + baseY;
          if   (screenY >= parentMaxY) { break; } 

          const line    = this.buffer[y]!;
          let   lineIdx = xStart;
          for (let x = xStart; x < line.length; x += 1) {
            const screenX = x + baseX;
            if   (screenX >= parentMaxX) { break; } 
            const codePoint = line.codePointAt(lineIdx)!;
            UiSetCell(screenX, screenY, codePoint, this.cellFlags, this.background, this.foreground);
            if (codePoint > 0xFFFF) { lineIdx += 1; }
            lineIdx += 1;
          }

        }
      }



    }

  }

  add(...children: BoxNode[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
}

function calcTextWrap(box: BoxNode, axis: Axis) {
  if (hasFlag(box.flags, BoxFlags_DrawText) && (box.rawText && box.textDirty)) {
    if (axis === AxisX) {
      if (box.preferedSize[0].kind === BoxSizeKind_TextContent) {
        box.text   = box.rawText;
        box.buffer = box.text.split("\n");
      }

    } else {
      if (box.preferedSize[0].kind !== BoxSizeKind_TextContent) {
        const width = box.fixedSize[0];

        if (box.wrappedWidth !== width) {
          box.text         = Bun.wrapAnsi(box.rawText, width, { hard: true, trim: false });
          box.buffer       = box.text.split("\n");
          box.wrappedWidth = width;
          box.textDirty    = false;
        }

      }
    }
  }

  for (const child of box.children) {
    calcTextWrap(child, axis);
  }
}


function calcLayoutFixedSize(box: BoxNode, axis: Axis) {
  const size = box.preferedSize[axis]!; 

  switch (size.kind) {
    case BoxSizeKind_Fixed: {
      box.fixedSize[axis] = size.value;
    } break;
    case BoxSizeKind_TextContent: {
      if (!box.rawText) { break; }

      if (axis === 0) {
        let maxWidth = 0;
        for (const line of box.buffer) {
          if (line.length > maxWidth) { maxWidth = line.length; }
        }

        box.fixedSize[0] = maxWidth + size.value;
      } else {
        box.fixedSize[1] = box.buffer.length + size.value;
      }

    } break;
    default: break;
  }

  for (const child of box.children) {
    calcLayoutFixedSize(child, axis);
  }
}

function calcLayoutPctSize(box: BoxNode, axis: Axis) {
  const size = box.preferedSize[axis]!; 

  switch (size.kind) {
    case BoxSizeKind_ParentPercent: {
      let fixedParent: BoxNode | null = null;
      for (let parent = box.parent; parent !== null; parent = parent.parent) {
        const parentSize = parent.preferedSize[axis]!; 
        if (parentSize.kind === BoxSizeKind_Fixed       ||
            parentSize.kind === BoxSizeKind_TextContent || 
            parentSize.kind === BoxSizeKind_ParentPercent) {
          fixedParent = parent;
          break;
        }
      }

      if (fixedParent) {
        box.fixedSize[axis] = fixedParent.fixedSize[axis]! * size.value; 
      }

    } break;

    default: break;
  }

  for (const child of box.children) {
    calcLayoutPctSize(child, axis);
  }
}

function calcLayoutFitSize(box: BoxNode, axis: Axis) {
  for (const child of box.children) {
    calcLayoutFitSize(child, axis);
  }

  const size = box.preferedSize[axis]!;
  switch (size.kind) {
    case BoxSizeKind_FitContent: {
      let sum = Math.max(0, size.value);
      for (const child of box.children) {
        if (hasFlag(child.flags, BoxFlags_FloatingX << axis)) { continue; }

        if (axis === box.layoutAxis) {
          sum += child.fixedSize[axis]!;
        } else {
          sum = Math.max(sum, child.fixedSize[axis]!);
        }
      }

      box.fixedSize[axis] = sum;
    } break;
  }
}

function calcLayoutSizeClip(box: BoxNode, axis: Axis) {
  if (axis !== box.layoutAxis && !hasFlag(box.flags, BoxFlags_AllowOverflowX << axis)) {
    for (const child of box.children) {
      if (hasFlag(child.flags, BoxFlags_FloatingX << axis)) { continue; }

      let fix = child.fixedSize[axis]! - box.fixedSize[axis]!;
      if (fix > 0) { child.fixedSize[axis]! -= fix; }
    }
  }

  if (axis === box.layoutAxis && !hasFlag(box.flags, BoxFlags_AllowOverflowX << axis)) {
    let totalSize        = 0;
    let totalLimitedSize = 0;

    for (const child of box.children) {
      if (hasFlag(child.flags, BoxFlags_FloatingX << axis)) { continue; }

      totalSize        += child.fixedSize[axis]!;
      totalLimitedSize += child.fixedSize[axis]! * (1-child.preferedSize[axis]!.minKeepRatio);
    }

    const fix = totalSize - box.fixedSize[axis]!;
    if (fix > 0) {
      let error = 0;
      for (const child of box.children) {
        if (hasFlag(child.flags, BoxFlags_FloatingX << axis)) { continue; }

        let childFix = child.fixedSize[axis]! * (1-child.preferedSize[axis]!.minKeepRatio);
        childFix     = Math.max(0, childFix);

        const fixPct = clamp(fix / totalLimitedSize, 0, 1);
        const exact  = child.fixedSize[axis]! - childFix * fixPct;

        const fixedSize = Math.floor(exact + error);
        error += exact - fixedSize;

        child.fixedSize[axis] = fixedSize; 
      }
    }

  }

  for (const child of box.children) {
    calcLayoutSizeClip(child, axis);
  }
}

function calcLayoutPosition(box: BoxNode, axis: Axis) {
  let bounds         = 0;
  let layoutPosition = 0;
  for (const child of box.children) {
    if (!hasFlag(child.flags, BoxFlags_FloatingX << axis)) {
      child.fixedPosition[axis] = layoutPosition;
      if (axis === box.layoutAxis) {
        layoutPosition += child.fixedSize[axis]!;
        bounds         += child.fixedSize[axis]!;
      } else {
        bounds = Math.max(bounds, child.fixedSize[axis]!);
      }
    }

    child.rect.min[axis] = Math.floor(box.rect.min[axis]! + child.fixedPosition[axis]! - box.viewOffset[axis]!);
    child.rect.max[axis] = Math.floor(child.rect.min[axis] + child.fixedSize[axis]!); 
  }

  box.viewBounds[axis] = Math.floor(bounds);
  for (const child of box.children) {
    calcLayoutPosition(child, axis);
  }
}

function calcLayout(box: BoxNode) {
  for (let axis = 0; axis < AxisCount; axis += 1) {
    calcTextWrap(box,        axis);
    calcLayoutFixedSize(box, axis);
    calcLayoutPctSize(box,   axis);
    calcLayoutFitSize(box,   axis);
    calcLayoutSizeClip(box,  axis);
    calcLayoutPosition(box,  axis);
  } 
}
export {
  BoxNode,

  BoxFlags_FloatingX,
  BoxFlags_FloatingY,
  BoxFlags_AllowOverflowX,
  BoxFlags_AllowOverflowY,
  BoxFlags_DrawText,
  BoxFlags_DrawBackground,
  BoxFlags_ScrollView,
  BoxFlags_ScrollX,
  BoxFlags_ScrollY,
  BoxFlags_Clickable,
  BoxFlags_ViewClamp,
  BoxFlags_DrawTopBorder,
  BoxFlags_DrawRightBorder,
  BoxFlags_DrawBottomBorder,
  BoxFlags_DrawLeftBorder,

  sizeFitContent,
  sizeFixed,
  sizeParentPct,
  sizeText,

  calcLayout,
  BoxIdNone,
}

export type {
  BoxId,
  BoxOpts,
  BoxNode as Box
}
