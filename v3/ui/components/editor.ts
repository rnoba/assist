import { DebugLog } from "../../debug";
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

const EDITOR_CACHE: Map<number, Editor> = new Map();

class Editor {
  text:   string;
  offset: number;
  constructor(initialText: string, offset: number) {
    this.text   = initialText;
    this.offset = offset;
  }

  static make(hash: string, text: string = "", offset: number = 0) {
    const root = Box("", { prefWidth:  sizeParentPct(1), prefHeight: sizeFitContent() });
    const base = Box(hash, {
      flags:      BoxFlags_Clickable|BoxFlags_DrawBackground|BoxFlags_ScrollView|BoxFlags_ScrollY|BoxFlags_AllowOverflowY|BoxFlags_ViewClamp,
      prefWidth:  sizeParentPct(1),
      prefHeight: sizeFitContent(),
      background: ColorKind_Primary,
      foreground: ColorKind_Text,
      maxFixedHeight: 10,
    });

    let editorState = EDITOR_CACHE.get(base.id);
    if (editorState === undefined) {
      editorState = new Editor(text, offset);
      EDITOR_CACHE.set(base.id, editorState);
    }

    base.interact();

    const content = Box(hash + "-content", {
      flags:      BoxFlags_DrawBackground|BoxFlags_DrawText|BoxFlags_TextWrap,
      prefWidth:  sizeParentPct(1), 
      prefHeight: sizeText(), 
      foreground: ColorKind_Text,
      background: ColorKind_Primary,
      text: editorState.text, 
    }); base.add(content);

    const indicator = Box(hash + "-indicator", {
      flags:      BoxFlags_DrawText,
      prefWidth:  sizeFixed(2, 1),
      prefHeight: sizeFixed(1, 1),
      foreground: ColorKind_Text,
      text: ">",
    });
    root.add(indicator, base);
    return root;
  }
}

export { Editor };
