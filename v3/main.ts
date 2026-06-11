import { BoxFlags_DrawBackground, BoxFlags_DrawText, sizeParentPct, sizeText } from "./ui/box";
import { ColorKind_Primary, ColorKind_Secondary, ColorKind_Text } from "./ui/color";
import { InputInit } from "./ui/input";

import {
  Box,
  UiBeginFrame,
  UiEndFrame,
  UiInit,
  UiState
} from "./ui/renderer";

UiInit();
InputInit();

for (;;) {
  UiBeginFrame();
  const root = Box(1, {
    size:       [sizeParentPct(1), sizeParentPct(1)],
    flags:      BoxFlags_DrawBackground,
    background: ColorKind_Secondary,
    foreground: ColorKind_Text,
  });

  const text = Box(2, {
    size: [sizeText(), sizeText()],
    flags:      BoxFlags_DrawBackground|BoxFlags_DrawText,
    background: ColorKind_Primary,
    foreground: ColorKind_Text,
    text: `${(1000/UiState.frameDelta).toFixed(0)} FPS - ${UiState.BOX_CACHE.size} NODES - ${UiState.BOX_FREE_LIST.length} FREE NODES`,
  }); root.add(text);

  UiState.root.add(root);
  await UiEndFrame();
}
