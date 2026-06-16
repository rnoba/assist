import { DebugClose, DebugOpen } from "./debug";
import {
  BoxFlags_AllowOverflowY,
  BoxFlags_Clickable,
  BoxFlags_DrawBackground,
  BoxFlags_DrawText,
  BoxFlags_ScrollView,
  BoxFlags_ScrollY,
  BoxFlags_TextWrap,
  BoxFlags_ViewClamp,
  sizeFitContent,
  sizeFixed,
  sizeParentPct,
  sizeText
} from "./ui/box";
import { ColorKind_Primary, ColorKind_Secondary, ColorKind_Text } from "./ui/color";
import { Editor } from "./ui/components/editor";
import { InputInit } from "./ui/input";

import {
  Box,
  UiBeginFrame,
  UiEndFrame,
  UiInit,
  UiState
} from "./ui/renderer";

import { AxisY } from "./utils";

DebugOpen();
UiInit();
InputInit();

for (;;) {
  UiBeginFrame();
  const root = Box("--root", {
    prefWidth:  sizeParentPct(1),
    prefHeight: sizeParentPct(1),
    layoutAxis: 1,
  });

  const text = Box("--root-text", {
    prefWidth:  sizeParentPct(1),
    prefHeight: sizeText(),
    flags:      BoxFlags_DrawBackground|BoxFlags_DrawText|BoxFlags_TextWrap,
    background: ColorKind_Primary,
    foreground: ColorKind_Text,
    text: `(x: ${UiState.cursor.x}, y: ${UiState.cursor.y}) - HOT: ${UiState.hot}, ACTIVE: ${UiState.active}, FUCUSED: ${UiState.focused} - ${UiState.UI_EVENTS.length} EVENTS ${(1000/UiState.frameDelta).toFixed(0)} FPS - ${UiState.BOX_CACHE.size} NODES - ${UiState.BOX_FREE_LIST.length} FREE NODES - ${(UiState.elapsed/1000).toFixed(2)} ELAPSED - CURRENT FRAME ${UiState.frameCount}`,
  });
 
  const topBorder = Box("--root-editor-top-border", {
    flags:      BoxFlags_DrawText,
    prefWidth:  sizeParentPct(1),
    prefHeight: sizeFixed(1, 1),
    background: ColorKind_Primary,
    foreground: ColorKind_Text,
    text: "─".repeat(root.rect.max[0]-root.rect.min[0]),
  });

  const editor = Editor.make("editor");

  const bottomBorder = Box("--root-editor-bottom-border", {
    flags:      BoxFlags_DrawText,
    prefWidth:  sizeParentPct(1),
    prefHeight: sizeFixed(1, 1),
    background: ColorKind_Primary,
    foreground: ColorKind_Text,
    text: "─".repeat(root.rect.max[0]-root.rect.min[0]),
  });

  root.add(text, topBorder, editor, bottomBorder);


  UiState.root.add(root);
  await UiEndFrame();
}
