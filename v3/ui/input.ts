let buffer: string = "";

type Event = {
};

const EVENT_QUEUE = [];

function processChunk(chunk: string) {
  for (let idx = 0; idx < chunk.length; idx += 1) {
    const char = chunk[idx]!;
    const code = char.charCodeAt(0);
    
    if (code === 3) {
      process.exit(130);
    }

  }
}

function InputInit() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.ref();

    process.stdin.on('readable', () => {
      let chunk = process.stdin.read();
      while (chunk !== null) {
        if (typeof chunk === 'string') { processChunk(chunk); }
        chunk = process.stdin.read();
      }
    });
  }
}

function InputPoll() {
}

export {
  InputInit,
  InputPoll
}
