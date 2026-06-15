import { DebugLog } from "../debug";
import {
  AxisCount,
  AxisX,
  clamp,
  hasFlag,
  Range2xIntersect,
  Range2xIntersectPoint,
  Range2xMake,

  type Axis,
  type Range2x
} from "../utils";


import { ColorKind_None } from "./color";

import {
  EventActionKind_Press,
  EventActionKind_Release,
  EventActionKind_ScrollDown,
  EventActionKind_ScrollUp,
  EventKind_Mouse,
  EventModFlag_Shift
} from "./input";

import { UiSetCell, UiState } from "./renderer";

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

const BoxFlags_TextAlignCenterX = 1 << 11;
const BoxFlags_TextAlignCenterY = 1 << 12;
const BoxFlags_TextAlignCenter  = BoxFlags_TextAlignCenterX|BoxFlags_TextAlignCenterY;
const BoxFlags_TextAlignLeft    = 1 << 13;
const BoxFlags_TextAlignRight   = 1 << 14;

const BoxFlags_TextWrap         = 1 << 15;

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

  prefWidth?:  BoxSize;
  prefHeight?: BoxSize;
  maxFixedWidth?:  number;
  maxFixedHeight?: number;
};

type BoxInteraction = {
  hovering: boolean;
  scroll: [number, number];
};
type BoxTextMetrics = {
  size:                  [number, number];
  lineBoundaries:        number[];
  wrappedLineBoundaries: number[];
  lineMetrics:           number[];
  totalWidth:            number;
};
type BoxId             = number;
const BoxIdNone: BoxId = 0;
class BoxNode {
  id: BoxId = BoxIdNone;

  rawText:      string | null = null;
  wrappedText:  string | null = null;
  textMetrics: BoxTextMetrics = {
    size:                  [0, 0],
    lineBoundaries:        [],
    wrappedLineBoundaries: [],
    lineMetrics:           [],
    totalWidth:            0,
  };
  lastTextMetricsWrapWidth   = 0;

  flags: number = 0;
  rect: Range2x = Range2xMake(0, 0, 0, 0);
  fixedPosition: [number, number] = [0, 0];
  fixedSize:     [number, number] = [0, 0];
  viewOffset:    [number, number] = [0, 0];
  viewBounds:    [number, number] = [0, 0];
  maxFixedSize:  [number, number] = [0, 0];

  layoutAxis: Axis = AxisX;

  parent: BoxNode | null = null;

  children:      BoxNode[] = [];
  preferedSize: [BoxSize, BoxSize] = [sizeFitContent(), sizeFitContent()];

  background: number = ColorKind_None;
  foreground: number = ColorKind_None;
  cellFlags:  number = 0;
  lastRenderedFrame: number = -1;

  reset() {}

  render() {
    // TODO(rnoba): better text rendering/caching
    // TODO(rnoba): text alignment 
    if (this.id !== BoxIdNone) {

      let rect: Range2x = this.rect;

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

      if (hasFlag(this.flags, BoxFlags_DrawText) && this.rawText !== null) {
        let text = this.rawText;
        if (hasFlag(this.flags, BoxFlags_TextWrap)) { text = this.wrappedText!; }

        const offsetX    = this.fixedPosition[0]-this.rect.min[0]; 
        const offsetY    = this.fixedPosition[1]-this.rect.min[1]; 
        const clipRight  = this.parent?.rect.max[0] ?? rect.max[0];
        const clipBottom = this.parent?.rect.max[1] ?? rect.max[1];

        let startX = Math.max(0, offsetX);
        let startY = Math.max(0, offsetY);

        let offset = 0;
        for (let idx = 0; idx < startY; idx += 1) {
          offset += this.textMetrics.lineBoundaries[idx]! + 1;
        }

        for (let y = startY; y < this.textMetrics.lineBoundaries.length; y += 1) {
          const screenY = y + baseY - offsetY;
          if (screenY >= clipBottom) { break; }

          const width = this.textMetrics.lineBoundaries[y]!;
          for (let x = startX; x < width; x += 1) {
            const screenX = x + baseX - offsetX;
            if (screenX >= clipRight) { break; }

            UiSetCell(screenX, screenY, text.codePointAt(offset + x)!,
                      this.cellFlags, this.background, this.foreground);
          }

          offset += width + 1;
        }

      }


    }

  }

  interact(): BoxInteraction {
    const it: BoxInteraction = {
      hovering: false,
      scroll: [0, 0],
    };

    let rect: Range2x = this.rect;
    for (let parent = this.parent; parent !== null; parent = parent.parent) {
      rect = Range2xIntersect(rect, parent.rect);
    }
    const baseX      = rect.min[0];
    const baseY      = rect.min[1];
    const baseWidth  = rect.max[0] - baseX;
    const baseHeight = rect.max[1] - baseY;
    if (baseWidth <= 0 || baseHeight <= 0) { return it; }

    const clickable = hasFlag(this.flags, BoxFlags_Clickable);
    let   scrolled  = false;

    const evtsToRemove: number[] = [];
    for (let idx = 0; idx < UiState.UI_EVENTS.length; idx += 1) {
      const event  = UiState.UI_EVENTS[idx]!;
      let   remove = false;

      const hovering          = Range2xIntersectPoint(rect, event.mouseX, event.mouseY); 
      const hoveringClickable = hovering && clickable;
      const isMouseEvt        = event.kind === EventKind_Mouse;

      if (isMouseEvt) {
        switch (event.action) {
          default: {} break;
          case EventActionKind_ScrollUp:
            case EventActionKind_ScrollDown: {
            if (hasFlag(this.flags, BoxFlags_ScrollView) && (hasFlag(this.flags, BoxFlags_ScrollX) || hasFlag(this.flags, BoxFlags_ScrollY))) {
              const direction = event.action === EventActionKind_ScrollUp ? -1 : 1;
              const axis      = (hasFlag(this.flags, BoxFlags_ScrollX) && ((event.mod & EventModFlag_Shift) !== 0)) ? 0 : 1;

              this.viewOffset[axis] += direction;
              it.scroll[axis]        = direction;
              scrolled = true;
              remove   = true;
            }
          } break;
          case EventActionKind_Press: {
            if (hoveringClickable) {
              UiState.hot     = this.id;
              UiState.active  = this.id;
              UiState.focused = this.id;

              remove = true;
            }

            if (UiState.active === this.id && !hovering && clickable) {
              UiState.focused = BoxIdNone;

              remove = true;
            }
          } break;
          case EventActionKind_Release: {
            if (UiState.active === this.id && hoveringClickable) {
              UiState.active = BoxIdNone;

              remove = true;
            }

            if (UiState.active === this.id && !hovering && clickable) {
              UiState.hot    = BoxIdNone;
              UiState.active = BoxIdNone;

              remove = true;
            }
          } break;
        }

      }


      if (remove) { evtsToRemove.push(idx); }
    }

    for (let idx = evtsToRemove.length - 1; idx >= 0; idx -= 1) {
      UiState.UI_EVENTS.splice(evtsToRemove[idx]!, 1);
    }

    if(scrolled && hasFlag(this.flags, BoxFlags_ViewClamp)) {
      const maxViewX = Math.max(0, this.viewBounds[0] - this.fixedSize[0]);
      const maxViewY = Math.max(0, this.viewBounds[1] - this.fixedSize[1]);
      this.viewOffset[0] = clamp(this.viewOffset[0], 0, maxViewX);
      this.viewOffset[1] = clamp(this.viewOffset[1], 0, maxViewY);
    }

    const mouseOver = Range2xIntersectPoint(rect, UiState.cursor.x, UiState.cursor.y); 
    if (mouseOver                                                   &&
       clickable                                                    &&
       (UiState.hot    === BoxIdNone || UiState.hot    === this.id) &&
       (UiState.active === BoxIdNone || UiState.active === this.id)) {
      UiState.hot = this.id;
    }

    if (!mouseOver && clickable && UiState.hot === this.id) {
      UiState.hot = BoxIdNone;
    }

    return it;
  }

  add(...children: BoxNode[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
}

function calcLayoutFixedSize(box: BoxNode, axis: Axis) {
  const size = box.preferedSize[axis]!; 

  switch (size.kind) {
    case BoxSizeKind_Fixed: {
      box.fixedSize[axis] = size.value;
    } break;
    case BoxSizeKind_TextContent: {
      if (hasFlag(box!.flags, BoxFlags_DrawText) && box.rawText !== null) {
        box.fixedSize[axis] = box.textMetrics!.size[axis]! + size.value;
      }
      // switch (axis) {
        // default: {} break;
        // case AxisX: {
        //
        //   if (!hasFlag(box.flags, BoxFlags_TextWrap)) {
        //     let maxWidth = 0;
        //     const split  = box.rawText.split("\n");
        //     for (let idx = 0; idx < split.length; idx += 1) {
        //       if (split[idx]!.length > maxWidth) { maxWidth = split[idx]!.length; }
        //     }
        //
        //     box.fixedSize[AxisX] = maxWidth + size.value;
        //   }
        //
        // } break;
        // case AxisY: {
        //   let height = 0;
        //   if (hasFlag(box.flags, BoxFlags_TextWrap)) {
        //     const width = box.fixedSize[AxisX];
        //     if (box.wrappedWidth !== width || box.textDirty) {
        //       box.buffer       = splitText(box.rawText, width);
        //       box.wrappedWidth = width;
        //       box.textDirty    = false;
        //     }
        //
        //     height = box.buffer.length;
        //   } else {
        //     let lines = 1;
        //
        //     for (let idx = 0; idx < box.rawText.length; idx += 1) {
        //       if (box.rawText.charCodeAt(idx) === 0x0a) {
        //         lines += 1;
        //       }
        //
        //     }
        //     height = lines;
        //   }
        //
        //   box.fixedSize[AxisY] = height + size.value;
        // } break;
      // }
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
    child.fixedSize[axis] = Math.min(child.fixedSize[axis]!, child.maxFixedSize[axis]!);;
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
  BoxFlags_TextWrap,

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
  BoxTextMetrics
}
