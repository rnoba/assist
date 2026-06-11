type Color = { r: number; g: number; b: number; };
function ColorMake(r: number, g: number, b: number): Color { return { r, g, b, }; }

const ColorKind_None      = 0;
const ColorKind_Primary   = 1;
const ColorKind_Secondary = 2;
const ColorKind_Text      = 3;
const ColorKind_Gray      = 4;
const _ColorKind_Count    = 5;

const PALETTE = {
  [ColorKind_Primary]:   ColorMake(2, 2, 2),
  [ColorKind_Secondary]: ColorMake(222, 35, 104),
  [ColorKind_Text]:      ColorMake(185, 148, 104),
  [ColorKind_Gray]:      ColorMake(99, 82, 61),
};

type ColorKind = keyof typeof PALETTE; 
function colorFromKind(color: ColorKind) {
  return PALETTE[color] ?? null;
}
function colorValid(color: number): color is ColorKind {
  return color >= ColorKind_None &&
         color < _ColorKind_Count;
}

export {
  ColorMake,

  colorFromKind,
  colorValid,

  ColorKind_None,
  ColorKind_Primary,
  ColorKind_Secondary,
  ColorKind_Text,
  ColorKind_Gray,
}

export type {
  Color,
  ColorKind
}
