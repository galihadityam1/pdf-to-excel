export function removeTableLines(data: Uint8ClampedArray, width: number, height: number) {
  // Long scan rules merge with glyphs during OCR. Mask both axes from the
  // original pixels so erasing one axis cannot break detection of the other.
  const dark = new Uint8Array(width * height);
  const lines = new Uint8Array(dark.length);
  for (let i = 0; i < dark.length; i++) {
    dark[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) < 450 ? 1 : 0;
  }
  for (const horizontal of [true, false]) {
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    const minimum = horizontal ? Math.max(60, Math.round(width / 30)) : Math.max(60, Math.round(height / 40));
    for (let a = 0; a < outer; a++) {
      let start = 0;
      for (let b = 0; b <= inner; b++) {
        const index = horizontal ? a * width + b : b * width + a;
        if (b < inner && dark[index]) continue;
        if (b - start >= minimum) {
          for (let c = start; c < b; c++) {
            for (let offset = -1; offset <= 1; offset++) {
              const axis = a + offset;
              if (axis >= 0 && axis < outer) lines[horizontal ? axis * width + c : c * width + axis] = 1;
            }
          }
        }
        start = b + 1;
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) data.fill(255, i * 4, i * 4 + 4);
  }
}
