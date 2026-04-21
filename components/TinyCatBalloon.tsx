// components/TinyCatBalloon.tsx
// 8-bit pixel art: black cat inflates into a balloon and floats away.
// Adapted from the "Tiny Cat Balloon" design (claude.ai/design).
//
// Timeline (5s loop @ 8fps = 40 frames):
//   frames  0–11  (1.5s) : idle — tail wag, blink
//   frames 12–17  (0.75s): inflate 1 — body puffs out
//   frames 18–23  (0.75s): inflate 2 — full balloon shape
//   frames 24–39  (2.0s) : balloon floats up & off screen with sparkles

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

// ── Palette ────────────────────────────────────────────────────────────────
const PALETTE: Record<string, string | null> = {
  '.': null,
  K: '#0a0a0a',   // black — cat body / outline
  k: '#2a2a2a',   // dark gray — shadow
  G: '#B9FF6B',   // lime green — eyes (from app icon)
  W: '#ffffff',   // white — highlight
  P: '#FF9BDE',   // pink — nose / inner ear
  S: '#1a1a1a',   // near-black — balloon string
  g: '#7fc93c',   // deeper green — eye shadow
};

// ── Sprite grids — 24 cols × 28 rows ──────────────────────────────────────
const CAT_A = [
  '........................',
  '........................',
  '........................',
  '....KK........KK........',
  '...KKKK......KKKK.......',
  '..KKPPKK....KKPPKK......',
  '..KKPKKKKKKKKKKPKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKGGKKKKKKGGKKKK.....',
  '.KKKGWGKKKKKKGWGKKK.....',
  '.KKKGGGKKKKKKGGGKKK.....',
  '.KKKKKKKKPPKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKK..KK...',
  '..KKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKK....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '...KKKK......KKKK.......',
  '........................',
  '........................',
];

const CAT_B = [
  '........................',
  '........................',
  '........................',
  '....KK........KK........',
  '...KKKK......KKKK.......',
  '..KKPPKK....KKPPKK......',
  '..KKPKKKKKKKKKKPKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKGGKKKKKKGGKKKK.....',
  '.KKKGWGKKKKKKGWGKKK.....',
  '.KKKGGGKKKKKKGGGKKK.....',
  '.KKKKKKKKPPKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKK.......',
  '..KKKKKKKKKKKKKKKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKK..KK.',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '...KKKK......KKKK.......',
  '........................',
  '........................',
];

const CAT_BLINK = [
  '........................',
  '........................',
  '........................',
  '....KK........KK........',
  '...KKKK......KKKK.......',
  '..KKPPKK....KKPPKK......',
  '..KKPKKKKKKKKKKPKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKGKKKKKKKKGKKKKK....',
  '.KKKGGGKKKKKKGGGKKKK....',
  '.KKKKKKKKPPKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKK..KK...',
  '..KKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKK....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '..KKKKKK....KKKKKK......',
  '...KKKK......KKKK.......',
  '........................',
  '........................',
];

const INFLATE_1 = [
  '........................',
  '........................',
  '....KK........KK........',
  '...KKKK......KKKK.......',
  '..KKPPKK....KKPPKK......',
  '..KKPKKKKKKKKKKPKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKGGKKKKKKKKGGKKKK....',
  'KKKGWGKKKKKKKKGWGKKK....',
  'KKKGGGKKKKKKKKGGGKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKPPKKKKKKKK....',
  'KKKKKKKKKKPPKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKKKK.....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKK......',
  '...KKKK......KKKK.......',
  '........................',
  '........................',
  '........................',
];

const INFLATE_2 = [
  '........................',
  '........................',
  '.....K........K.........',
  '....KK........KK........',
  '....KK........KK........',
  '...KKKKKKKKKKKKKK.......',
  '..KKKKKKKKKKKKKKKK......',
  '.KKKKKKKKKKKKKKKKKK.....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKGKKKKKKKKGKKKKK....',
  'KKKKGGGKKKKKKGGGKKKK....',
  'KKKKKKKKKKPPKKKKKKKK....',
  'KKKKKKKKKKPPKKKKKKKK....',
  'KKKKKKKKKWWWKKKKKKKK....',
  'KKWKKKKKKKKKKKKKKKKK....',
  'KKWKKKKKKKKKKKKKKKKK....',
  'KKWKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  'KKKKKKKKKKKKKKKKKKKK....',
  '.KKKKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKK.......',
  '....KKKK....KKKK........',
  '........................',
  '........................',
  '........................',
];

const BALLOON = [
  '........................',
  '........................',
  '......KKKKKKKKKK........',
  '.....KKKKKKKKKKKK.......',
  '....KKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKKKK....',
  '..KKKWKKKKKKKKKKKKKK....',
  '.KKKWWKKKKKKKKKKKKKKK...',
  '.KKKWKKKKGGKKKKGGKKKK...',
  '.KKKKKKKKGGKKKKGGKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKPPKKKKKKKKK...',
  '.KKKKKKKKPPPPKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '..KKKKKKKKKKKKKKKKKK....',
  '..KKKKKKKKKKKKKKKKKK....',
  '...KKKKKKKKKKKKKKKK.....',
  '....KKKKKKKKKKKKKK......',
  '.....KKKKKKKKKKKK.......',
  '......KKKKKKKKKK........',
  '.......KKKKKKKK.........',
  '..........KK............',
  '.........KKKK...........',
  '..........SS............',
  '..........S.............',
  '...........S............',
  '..........S.............',
];

const BALLOON_SWAY = [
  '........................',
  '........................',
  '......KKKKKKKKKK........',
  '.....KKKKKKKKKKKK.......',
  '....KKKKKKKKKKKKKK......',
  '...KKKKKKKKKKKKKKKK.....',
  '..KKKKKKKKKKKKKKKKKK....',
  '..KKKWKKKKKKKKKKKKKK....',
  '.KKKWWKKKKKKKKKKKKKKK...',
  '.KKKWKKKKGGKKKKGGKKKK...',
  '.KKKKKKKKGGKKKKGGKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKPPKKKKKKKKK...',
  '.KKKKKKKKPPPPKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '..KKKKKKKKKKKKKKKKKK....',
  '..KKKKKKKKKKKKKKKKKK....',
  '...KKKKKKKKKKKKKKKK.....',
  '....KKKKKKKKKKKKKK......',
  '.....KKKKKKKKKKKK.......',
  '......KKKKKKKKKK........',
  '.......KKKKKKKK.........',
  '..........KK............',
  '.........KKKK...........',
  '..........SS............',
  '...........S............',
  '..........S.............',
  '...........S............',
];

// Small accent sprites
const SPARKLE = ['.G..', 'GGG.', '.G..', '....'];
const PUFF    = ['..WWWW..', '.WWWWWW.', 'WWWWWWWW', '.WWWWWW.'];

// ── Sizing ─────────────────────────────────────────────────────────────────
const PX = 6;           // screen px per "game pixel" → sprite = 144×168 px
const SPRITE_W = 24;    // sprite width in game pixels
const SPRITE_H = 28;    // sprite height in game pixels
const CONTAINER_W = 200;
const CONTAINER_H = 210;

// Center sprite horizontally; park it near the bottom so the cat sits naturally
const BASE_X = Math.floor((CONTAINER_W - SPRITE_W * PX) / 2); // 28
const BASE_Y = CONTAINER_H - SPRITE_H * PX - 4;               // 38

const TOTAL_FRAMES = 40; // 5 s × 8 fps

// ── Frame state ────────────────────────────────────────────────────────────
type FrameState = {
  grid: string[];
  mainX: number;
  mainY: number;
  showPuffs: boolean;
  puffFrame: number;
  showSparkles: boolean;
  sparklePhase: number;
};

function getFrameState(frame: number): FrameState {
  let grid: string[];
  let bobY = 0;       // vertical bob in game pixels
  let yOffset = 0;    // float rise in screen px
  let xOffset = 0;    // sway in screen px
  let showPuffs = false;
  let puffFrame = 0;
  let showSparkles = false;
  let sparklePhase = 0;

  if (frame < 12) {
    // ── IDLE: tail wag + blink ──────────────────────────────────────────
    const idleF = frame % 12;
    if (idleF === 5)      grid = CAT_BLINK;
    else if (idleF < 6)   grid = CAT_A;
    else                  grid = CAT_B;
    bobY = frame % 4 < 2 ? 0 : -1;
  } else if (frame < 18) {
    // ── INFLATE 1 ──────────────────────────────────────────────────────
    const f = frame - 12;
    grid = f % 2 === 0 ? INFLATE_1 : CAT_A;
    bobY = f % 2 === 0 ? -1 : 0;
    showPuffs = true;
    puffFrame = f;
  } else if (frame < 24) {
    // ── INFLATE 2 ──────────────────────────────────────────────────────
    const f = frame - 18;
    grid = f % 2 === 0 ? INFLATE_2 : INFLATE_1;
    bobY = f % 2 === 0 ? -2 : -1;
    showPuffs = true;
    puffFrame = f + 3;
  } else {
    // ── FLOAT — balloon rises and swings off screen ─────────────────────
    const f = frame - 24;                              // 0 .. 15
    const riseProgress = f / 16;                       // 0 .. ~0.94
    yOffset = -Math.pow(riseProgress, 1.4) * 280;      // accelerating rise
    xOffset = Math.sin(f * 0.5) * 3 * PX;             // gentle sway
    grid = frame % 2 === 0 ? BALLOON : BALLOON_SWAY;
    bobY = frame % 4 < 2 ? 0 : -1;
    showSparkles = true;
    sparklePhase = frame;
  }

  return {
    grid,
    mainX: BASE_X + xOffset,
    mainY: BASE_Y + bobY * PX + yOffset,
    showPuffs,
    puffFrame,
    showSparkles,
    sparklePhase,
  };
}

// ── Pixel sprite renderer ──────────────────────────────────────────────────
// Renders a 2D character grid as SVG <Rect> elements at `(x, y)` origin.
function SpriteGroup({ grid, x, y, px = PX }: { grid: string[]; x: number; y: number; px?: number }) {
  const rects: React.ReactElement[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const color = PALETTE[row[c]];
      if (!color) continue;
      rects.push(
        <Rect
          key={r * 40 + c}
          x={c * px}
          y={r * px}
          width={px}
          height={px}
          fill={color}
        />,
      );
    }
  }
  return <G transform={`translate(${Math.round(x)}, ${Math.round(y)})`}>{rects}</G>;
}

// ── Component ──────────────────────────────────────────────────────────────
export function TinyCatBalloon() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    // 125 ms per tick = 8 fps — classic NES stepped-frame feel
    const id = setInterval(() => setFrame(f => (f + 1) % TOTAL_FRAMES), 125);
    return () => clearInterval(id);
  }, []);

  const { grid, mainX, mainY, showPuffs, puffFrame, showSparkles, sparklePhase } =
    getFrameState(frame);

  return (
    // SVG naturally clips content to its viewport, so the balloon disappears
    // cleanly as it floats above the top edge.
    <View style={{ width: CONTAINER_W, height: CONTAINER_H, alignSelf: 'center' }}>
      <Svg width={CONTAINER_W} height={CONTAINER_H}>
        {/* Puff clouds while inflating */}
        {showPuffs && (
          <>
            <SpriteGroup
              grid={PUFF}
              x={mainX - 8 * PX + (puffFrame % 2) * PX}
              y={mainY + 8 * PX}
            />
            <SpriteGroup
              grid={PUFF}
              x={mainX + 20 * PX - (puffFrame % 2) * PX}
              y={mainY + 14 * PX}
            />
          </>
        )}

        {/* Main sprite (cat / balloon) */}
        <SpriteGroup grid={grid} x={mainX} y={mainY} />

        {/* Lime sparkles around the floating balloon */}
        {showSparkles && (
          <>
            <SpriteGroup
              grid={SPARKLE}
              x={mainX - 3 * PX + (sparklePhase % 2) * PX}
              y={mainY + 4 * PX}
            />
            <SpriteGroup
              grid={SPARKLE}
              x={mainX + SPRITE_W * PX - (sparklePhase % 3) * PX}
              y={mainY + 8 * PX}
            />
            <SpriteGroup
              grid={SPARKLE}
              x={mainX + 5 * PX + (sparklePhase % 2) * PX * 2}
              y={mainY - 3 * PX}
            />
          </>
        )}
      </Svg>
    </View>
  );
}
