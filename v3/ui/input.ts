let buffer: string = "";

const EventKind_Mouse = 0;
const EventKind_Key   = 1;
const EventKind_Paste = 2;

const EventActionKind_Press      = 0;
const EventActionKind_Release    = 1;
const EventActionKind_ScrollUp   = 2;
const EventActionKind_ScrollDown = 3;
const EventActionKind_Move       = 4;

const EventModFlag_Shift = 1 << 0;
const EventModFlag_Ctrl  = 1 << 1;
const EventModFlag_Alt   = 1 << 2;

type Event = {
  kind:     number;
  sequence: string;
  name:     string;
  mod:      number;
  action:   number;
  code:     number;
  mouseX:   number;
  mouseY:   number;
};

const EVENT_QUEUE: Event[] = [];

function kittyMod(raw: number): number {
  const bits = raw - 1;
  let mod = 0;
  if (bits & 1) { mod |= EventModFlag_Shift; }
  if (bits & 2) { mod |= EventModFlag_Alt;   }
  if (bits & 4) { mod |= EventModFlag_Ctrl;  }
  return mod;
}

function kittyAction(evtType: number): number {
  if (evtType === 3) { return EventActionKind_Release; }
  return EventActionKind_Press;
}

function kittyKeyName(code: number): string {
  if (code >= 97  && code <= 122) { return String.fromCharCode(code);      } // a–z
  if (code >= 65  && code <=  90) { return String.fromCharCode(code + 32); } // A–Z
  if (code >= 48  && code <=  57) { return String.fromCharCode(code);      } // 0–9
  if (code === 13)  { return "enter";     }
  if (code === 27)  { return "esc";       }
  if (code === 9)   { return "tab";       }
  if (code === 127) { return "backspace"; }
  if (code === 32)  { return "space";     }
  if (code === 57441 || code === 57447) { return "shift";  }
  if (code === 57442 || code === 57448) { return "ctrl";   }
  if (code === 57443 || code === 57449) { return "alt";    }
  return `key${code}`;
}

function cursorKeyName(letter: string): string {
  switch (letter) {
    case "A": return "up";
    case "B": return "down";
    case "C": return "right";
    case "D": return "left";
    case "H": return "home";
    case "F": return "end";
    case "P": return "f1";
    case "Q": return "f2";
    case "S": return "f4";
    default:  return `key${letter}`;
  }
}

function tildeKeyName(num: number): string {
  switch (num) {
    case 2:  return "insert";
    case 3:  return "delete";
    case 5:  return "pageup";
    case 6:  return "pagedown";
    case 7:  return "home";
    case 8:  return "end";
    case 11: return "f1";
    case 12: return "f2";
    case 13: return "f3";
    case 14: return "f4";
    case 15: return "f5";
    case 17: return "f6";
    case 18: return "f7";
    case 19: return "f8";
    case 20: return "f9";
    case 21: return "f10";
    case 23: return "f11";
    case 24: return "f12";
    default: return `key${num}`;
  }
}

function dec(s: string | undefined, fallback = 1): number {
  if (!s) { return fallback; }
  const n = parseInt(s, 10);
  return isNaN(n) ? fallback : n;
}

function processChunk(chunk: string): string {
  let idx = 0;

  for (; idx < chunk.length; idx += 1) {
    const char = chunk[idx]!;
    const code = char.charCodeAt(0);

    if (code === 0x03) { process.exit(130); }

    if (code === 0x7F || code === 0x08) {
      EVENT_QUEUE.push({
        kind: EventKind_Key,
        sequence: char,
        name: "backspace",
        mod: 0,
        action: EventActionKind_Press,
        mouseX: -1,
        mouseY: -1,
        code
      });
      continue;
    }

    if (chunk.startsWith("\x1b[200~", idx)) {
      const endIdx = chunk.indexOf("\x1b[201~", idx + 6);
      if (endIdx === -1) { return chunk.slice(idx); }

      const content = chunk.slice(idx + 6, endIdx);
      EVENT_QUEUE.push({
        kind: EventKind_Paste,
        sequence: content,
        name: "paste",
        mod: 0,
        action: EventActionKind_Press,
        mouseX: -1,
        mouseY: -1,
        code: 0
      });

      idx = endIdx + 5;
      continue;
    }

    if (code === 0x1B) {
      const remaining = chunk.slice(idx + 1);

      if (remaining.length === 0) {
        return chunk.slice(idx);
      }

      if (remaining[0] === "[") {
        let end = 1;
        while (end < remaining.length) {
          const c = remaining.charCodeAt(end);
          if (c >= 0x40 && c <= 0x7E) { break; }
          if (c >= 0x20 && c <= 0x3F) { end += 1; continue; }
          break;
        }

        if (end >= remaining.length) { return chunk.slice(idx); }

        const finalByte = remaining[end]!;
        const paramStr  = remaining.slice(1, end);

        if (paramStr[0] === "<" && (finalByte === "M" || finalByte === "m")) {
          const parts = paramStr.slice(1).split(";");
          if (parts.length === 3) {
            const cb = dec(parts[0], 0);
            const cx = dec(parts[1], 0);
            const cy = dec(parts[2], 0);

            let mod = 0;
            if (cb & 4)  { mod |= EventModFlag_Shift; }
            if (cb & 8)  { mod |= EventModFlag_Alt;   }
            if (cb & 16) { mod |= EventModFlag_Ctrl;  }

            let action: number;
            let name:   string;

            if (cb & 64) {
              if (cb & 1) { action = EventActionKind_ScrollDown; name = ""; }
              else        { action = EventActionKind_ScrollUp;   name = "";   }
            } else if (cb & 32) {
              action = EventActionKind_Move;
              const btn = cb & 3;
              if (btn === 0)      { name = "left";   }
              else if (btn === 1) { name = "middle"; }
              else if (btn === 2) { name = "right";  }
              else                { name = "";       }
            } else {
              action = (finalByte === "M") ? EventActionKind_Press : EventActionKind_Release;
              const btn = cb & 3;
              if (btn === 0)      { name = "left";   }
              else if (btn === 1) { name = "middle"; }
              else if (btn === 2) { name = "right";  }
              else                { name = "";       }
            }

            EVENT_QUEUE.push({
              kind: EventKind_Mouse,
              sequence: `\x1b${remaining.slice(0, end + 1)}`,
              name,
              mod,
              action,
              mouseX: cx,
              mouseY: cy,
              code: 0
            });
          }
        } else if (finalByte === "u") {
          const semi     = paramStr.split(";");
          const keyCode  = dec(semi[0]!.split(":")[0], 0);
          const modParts = (semi[1] ?? "1").split(":");
          const mod      = kittyMod(dec(modParts[0], 1));
          const action   = kittyAction(dec(modParts[1], 1));
          const name     = kittyKeyName(keyCode);

          if (keyCode === 99 && (mod & EventModFlag_Ctrl) && action !== EventActionKind_Release) {
            process.exit(130);
          }

          EVENT_QUEUE.push({
            kind: EventKind_Key,
            sequence: `\x1b${remaining.slice(0, end + 1)}`,
            name,
            mod,
            action,
            mouseX: -1,
            mouseY: -1,
            code: keyCode
          });
        } else if (finalByte === "Z") {
          const parts = paramStr.split(";");
          const mod   = kittyMod(dec(parts[1], 1)) | EventModFlag_Shift;
          EVENT_QUEUE.push({
            kind: EventKind_Key,
            sequence: "\x1b[Z",
            name: "tab",
            mod,
            action: EventActionKind_Press,
            mouseX: -1,
            mouseY: -1,
            code: 9
          });
        } else if (finalByte === "~") {
          const parts = paramStr.split(";");
          const num   = dec(parts[0], 0);
          const mod   = kittyMod(dec(parts[1], 1));
          const name  = tildeKeyName(num);
          EVENT_QUEUE.push({
            kind: EventKind_Key,
            sequence: `\x1b${remaining.slice(0, end + 1)}`,
            name,
            mod,
            action: EventActionKind_Press,
            mouseX: -1,
            mouseY: -1,
            code: num
          });
        } else {
          const cursorFinals = "ABCDFHPQS";
          if (cursorFinals.includes(finalByte)) {
            const parts = paramStr.split(";");
            const mod   = kittyMod(dec(parts[1], 1));
            const name  = cursorKeyName(finalByte);
            EVENT_QUEUE.push({
              kind: EventKind_Key,
              sequence: `\x1b${remaining.slice(0, end + 1)}`,
              name,
              mod,
              action: EventActionKind_Press,
              mouseX: -1,
              mouseY: -1,
              code: 0
            });
          }
        }

        idx += end + 1;
        continue;
      }

      if (remaining[0] === "O") {
        if (remaining.length < 2) { return chunk.slice(idx); }
        const letter = remaining[1]!;
        const name   = cursorKeyName(letter);
        EVENT_QUEUE.push({
          kind: EventKind_Key,
          sequence: `\x1bO${letter}`,
          name,
          mod: 0,
          action: EventActionKind_Press,
          mouseX: -1,
          mouseY: -1,
          code: 0
        });
        idx += 2;
        continue;
      }

      const altChar = remaining[0]!;
      EVENT_QUEUE.push({
        kind: EventKind_Key,
        sequence: `\x1b${altChar}`,
        name: altChar.toLowerCase(),
        mod: EventModFlag_Alt,
        action: EventActionKind_Press,
        mouseX: -1,
        mouseY: -1,
        code: altChar.charCodeAt(0)
      });
      idx += 1;
      continue;
    }

    if (code >= 0x01 && code <= 0x1A) {
      const letterCode = code + 96;
      EVENT_QUEUE.push({
        kind: EventKind_Key,
        sequence: char,
        name: String.fromCharCode(letterCode),
        mod: EventModFlag_Ctrl,
        action: EventActionKind_Press,
        mouseX: -1,
        mouseY: -1,
        code: letterCode
      });
      continue;
    }

    EVENT_QUEUE.push({
      kind: EventKind_Key,
      sequence: char,
      name: char,
      mod: 0,
      action: EventActionKind_Press,
      mouseX: -1,
      mouseY: -1,
      code
    });
  }

  return "";
}

function InputInit() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.ref();

    process.stdin.on("readable", () => {
      let chunk = process.stdin.read();
      while (chunk !== null) {
        if (typeof chunk !== "string") { chunk = process.stdin.read(); continue; }
        buffer += chunk;
        buffer  = processChunk(buffer);
        chunk   = process.stdin.read();
      }
    });
  }
}

function InputPoll(): Event[] {
  const events = EVENT_QUEUE.slice();
  EVENT_QUEUE.length = 0;
  return events;
}

export {
  EventKind_Mouse,
  EventKind_Key,
  EventKind_Paste,
  EventActionKind_Press,
  EventActionKind_Release,
  EventActionKind_ScrollUp,
  EventActionKind_ScrollDown,
  EventActionKind_Move,
  EventModFlag_Shift,
  EventModFlag_Ctrl,
  EventModFlag_Alt,
  InputInit,
  InputPoll
};

export type { Event }; 
