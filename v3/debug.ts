const DEBUG_FILE = "Public/debug";   

let FILE: Bun.BunFile  | null = null;
let PIPE: Bun.FileSink | null = null;

function DebugOpen() {
  FILE = Bun.file(DEBUG_FILE); Bun.write(FILE, "");
  PIPE = FILE.writer();
}

function DebugClose() {
  if (PIPE) {
    PIPE.flush();
    PIPE.end();
  }
}
function DebugLog(content: string) {
  if (PIPE) {
    PIPE.write(content + "\n");
    PIPE.flush();
  }
}

export {
  DebugOpen,
  DebugClose,
  DebugLog,
}
