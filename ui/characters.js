const GRIDS = {
  tomato: {
    body: "#ff7a6b",
    palette: { r: "#ff7a6b", g: "#6fcf8a", d: "#3d2f4a" },
    rows: [
      "................",
      ".......gg.......",
      "......gggg......",
      ".....g.gg.g.....",
      "....rrrrrrrr....",
      "...rrrrrrrrrr...",
      "..rrrrrrrrrrrr..",
      "..rrrrrrrrrrrr..",
      "..rrddrrrrddrr..",
      "..rrddrrrrddrr..",
      "..rrrrrrrrrrrr..",
      "..rrrdrrrrdrrr..",
      "...rrrddddrrr...",
      "....rrrrrrrr....",
      ".....rrrrrr.....",
      "................",
    ],
  },
  cat: {
    body: "#fff7f0",
    palette: { w: "#fff7f0", d: "#3d2f4a", p: "#ffa3b8", s: "#8fb8ff" },
    rows: [
      "................",
      "..ww........ww..",
      "..wwww....wwww..",
      "..wwwwwwwwwwww..",
      ".wwwwwwwwwwwwww.",
      ".wwwwwwwwwwwwww.",
      ".wwddwwwwwwddww.",
      ".wwddwwwwwwddww.",
      ".wwwwwwwwwwwwww.",
      ".wwwwwppwwwwwww.",
      ".wwwwwwwwwwwwww.",
      ".ssssssssssssss.",
      "..ssssssssssss..",
      "................",
      "................",
      "................",
    ],
  },
  owl: {
    body: "#a8e6cf",
    palette: { m: "#a8e6cf", w: "#ffffff", d: "#3d2f4a", b: "#ffcf7a" },
    rows: [
      "................",
      "..m..........m..",
      "..mm........mm..",
      "..mmmm....mmmm..",
      "..mmmmmmmmmmmm..",
      ".mmmmmmmmmmmmmm.",
      ".mmmmmmmmmmmmmm.",
      ".mmwwwwmmwwwwmm.",
      ".mmwddwmmwddwmm.",
      ".mmwwwwmmwwwwmm.",
      ".mmmmmmbbmmmmmm.",
      ".mmmmmmmmmmmmmm.",
      "..mmmmmmmmmmmm..",
      "...mmmmmmmmmm...",
      "................",
      "................",
    ],
  },
  blob: {
    body: "#c9b8ff",
    palette: { l: "#c9b8ff", s: "#7fdc9a", d: "#3d2f4a" },
    rows: [
      ".......s........",
      "......sss.......",
      "................",
      "....llllllll....",
      "...llllllllll...",
      "..llllllllllll..",
      "..llllllllllll..",
      "..llddllllddll..",
      "..llddllllddll..",
      "..llllllllllll..",
      "..llllllllllll..",
      "..llllllllllll..",
      "..llllllllllll..",
      "..llllllllllll..",
      "...llllllllll...",
      "....l.l..l.l....",
    ],
  },
};

export const CHARACTER_KEYS = Object.keys(GRIDS);

export function bodyColor(key) {
  return GRIDS[key].body;
}

const OUTLINE = "#3d2f4a";

export function spriteSVG(key) {
  const { palette, rows } = GRIDS[key];
  const grid = rows.map((row) => [...row].map((ch) => palette[ch] ?? null));
  const filled = (x, y) =>
    y >= 0 && y < grid.length && x >= 0 && x < 16 && grid[y][x] !== null;

  let outline = "";
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (
        !filled(x, y) &&
        (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))
      ) {
        outline += `<rect x="${x}" y="${y}" width="1" height="1" fill="${OUTLINE}"/>`;
      }
    }
  }

  let body = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      if (palette[ch]) {
        body += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${palette[ch]}"/>`;
      }
      x = end;
    }
  });

  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${outline}${body}</svg>`;
}
