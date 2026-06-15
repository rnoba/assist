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
} from "../box";
import { ColorKind_Primary, ColorKind_Secondary, ColorKind_Text } from "../color";

import { Box } from "../renderer";

class Editor {
  static make(hash: string) {
    const root = Box(hash, {
      flags:      BoxFlags_Clickable|BoxFlags_DrawBackground|BoxFlags_ScrollView|BoxFlags_ScrollY|BoxFlags_AllowOverflowY|BoxFlags_ViewClamp,
      prefWidth:  sizeParentPct(1),
      background: ColorKind_Secondary,
      maxFixedHeight:  2,
      foreground: ColorKind_Text,
    });

    root.interact();

    const content = Box(hash + "-content", {
      flags:      BoxFlags_DrawBackground|BoxFlags_DrawText|BoxFlags_TextWrap,
      foreground: ColorKind_Primary,
      background: ColorKind_Text,
      prefWidth:  sizeParentPct(1), 
      prefHeight: sizeText(), 
      text: "BoxFlags_Clickable|BoxFlags_DrawBackground|BoxFlags_Clickable|BoxFlags_DrawBackground|",
    });

    root.add(content);
    return root;
  }
}

export { Editor };
