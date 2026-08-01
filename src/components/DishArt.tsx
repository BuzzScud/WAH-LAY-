/**
 * Hand-drawn SVG artwork for every dish on the menu.
 *
 * Real photographs of Wah Lay's own food are the goal — drop a JPG into
 * `public/menu/` and it replaces the art automatically (see `lib/dishPhotos.ts`).
 * Until then this draws the dish instead of showing an empty grey box: it is a
 * few KB, it scales to any screen, it never mis-sells a dish the way stock
 * photography does, and it makes the menu look like one designed set.
 *
 * Pure SVG, no hooks beyond `useId` — so it server-renders inside .astro pages
 * with zero client JavaScript, and also renders inside the React order island.
 */
import { createContext, useContext, useId } from 'react';

export type ArtKind =
  | 'noodles'
  | 'rice'
  | 'soup'
  | 'wings'
  | 'ribs'
  | 'rolls'
  | 'dumpling'
  | 'crispy'
  | 'glazed'
  | 'broccoli'
  | 'shrimp'
  | 'eggfoo'
  | 'veg'
  | 'tofu'
  | 'platter'
  | 'fries'
  | 'wok';

/** Backdrop wash per archetype, so a category reads as one colour family. */
const WASH: Record<ArtKind, [string, string]> = {
  noodles: ['#3a2416', '#6d3f1c'],
  rice: ['#3a2a14', '#7a5320'],
  soup: ['#2b2a18', '#6b6127'],
  wings: ['#3d1d10', '#7d3d15'],
  ribs: ['#3a1310', '#7c2617'],
  rolls: ['#3b2612', '#82521c'],
  dumpling: ['#33261a', '#775729'],
  crispy: ['#3d1c0e', '#8a4110'],
  glazed: ['#3a2a0d', '#8a6714'],
  broccoli: ['#1c2f1e', '#2f6135'],
  shrimp: ['#3d1d1c', '#8a4230'],
  eggfoo: ['#3b2c11', '#856726'],
  veg: ['#1e2f22', '#356b40'],
  tofu: ['#2c3020', '#5e6b2c'],
  platter: ['#331d18', '#743a26'],
  fries: ['#3c2a10', '#8a6118'],
  wok: ['#2a1a15', '#63321d'],
};

export const ART_KINDS = Object.keys(WASH) as ArtKind[];

interface Props {
  kind: ArtKind;
  className?: string;
  /** Decorative art gets aria-hidden; pass a label only if it carries meaning. */
  label?: string;
  /** CSS filter from `artTint()` — nudges hue/brightness so two dishes sharing
   *  an archetype don't read as the same picture. */
  tint?: string;
}

/** Full standalone artwork — use for hero, showcase cards, section headers. */
export default function DishArt({ kind, className, label, tint }: Props) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      style={tint ? { filter: tint } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <ArtBody kind={kind} id={(k) => `${uid}-${k}`} animated />
    </svg>
  );
}

/**
 * All 16 archetypes once per page as <symbol>s. A 150-item menu then costs
 * ~60 bytes per thumbnail instead of ~2.5 KB of repeated gradient defs.
 */
export function DishArtSprite() {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {ART_KINDS.map((kind) => (
        <symbol key={kind} id={`art-${kind}`} viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
          <ArtBody kind={kind} id={(k) => `s-${kind}-${k}`} />
        </symbol>
      ))}
    </svg>
  );
}

/** Thumbnail that points at the sprite. Requires <DishArtSprite/> on the page. */
export function DishThumb({ kind, className, label, tint }: Props) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      style={tint ? { filter: tint } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <use href={`#art-${kind}`} />
    </svg>
  );
}

/* Steam only animates on the big standalone artwork. A 150-item menu of
   animated thumbnails pins the compositor for no visual gain at 80px. */
const Animated = createContext(false);

function ArtBody({
  kind,
  id,
  animated = false,
}: {
  kind: ArtKind;
  id: (k: string) => string;
  animated?: boolean;
}) {
  const [washA, washB] = WASH[kind];
  return (
    <Animated.Provider value={animated}>
      <defs>
        <linearGradient id={id('wash')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={washB} />
          <stop offset="100%" stopColor={washA} />
        </linearGradient>
        <radialGradient id={id('glow')} cx="50%" cy="58%" r="52%">
          <stop offset="0%" stopColor="#ffd89a" stopOpacity="0.42" />
          <stop offset="60%" stopColor="#ffb44f" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffb44f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('bowl')} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#fdf6ec" />
          <stop offset="55%" stopColor="#ecdcc6" />
          <stop offset="100%" stopColor="#c9b295" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fffaf2" />
          <stop offset="50%" stopColor="#e8d6bd" />
          <stop offset="100%" stopColor="#cbb497" />
        </linearGradient>
        <linearGradient id={id('sauce')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#e8863a" />
          <stop offset="55%" stopColor="#c14e1c" />
          <stop offset="100%" stopColor="#8d2f0f" />
        </linearGradient>
        <linearGradient id={id('gold')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#f5cf7d" />
          <stop offset="60%" stopColor="#dfa63f" />
          <stop offset="100%" stopColor="#a86f1d" />
        </linearGradient>
        <linearGradient id={id('green')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#6fbf62" />
          <stop offset="60%" stopColor="#3d8b3f" />
          <stop offset="100%" stopColor="#255c2c" />
        </linearGradient>
        <linearGradient id={id('meat')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#a3583c" />
          <stop offset="100%" stopColor="#5f2c1c" />
        </linearGradient>
      </defs>

      {/* Backdrop: wash + warm glow + faint concentric rings */}
      <rect width="200" height="200" fill={`url(#${id('wash')})`} />
      <rect width="200" height="200" fill={`url(#${id('glow')})`} />
      <g fill="none" stroke="#f6d79a" strokeOpacity="0.13">
        <circle cx="100" cy="112" r="58" />
        <circle cx="100" cy="112" r="76" strokeOpacity="0.08" />
        <circle cx="100" cy="112" r="94" strokeOpacity="0.05" />
      </g>

      <Scene kind={kind} id={id} />
    </Animated.Provider>
  );
}

/* ------------------------------------------------------------------ pieces */

/** Shared bowl. `w` is the half-width at the rim. */
function Bowl({ id, w = 62, y = 112 }: { id: (k: string) => string; w?: number; y?: number }) {
  return (
    <g>
      <path
        d={`M ${100 - w} ${y} a ${w} ${w * 0.92} 0 0 0 ${w * 2} 0 Z`}
        fill={`url(#${id('bowl')})`}
      />
      <ellipse cx="100" cy={y} rx={w} ry={w * 0.2} fill={`url(#${id('rim')})`} />
      <ellipse cx="100" cy={y} rx={w - 6} ry={w * 0.2 - 4} fill="#3a2a1e" fillOpacity="0.5" />
      {/* rim highlight + foot shadow */}
      <path
        d={`M ${100 - w + 4} ${y + 10} a ${w - 4} ${w * 0.85} 0 0 0 12 ${w * 0.5}`}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="100" cy={y + w * 0.92} rx={w * 0.5} ry="5" fill="#1a0f0a" fillOpacity="0.28" />
    </g>
  );
}

function Steam({ x = 100, y = 78, spread = 20 }: { x?: number; y?: number; spread?: number }) {
  const animated = useContext(Animated);
  return (
    <g
      className={animated ? 'steam' : undefined}
      stroke="#fff6e6"
      strokeOpacity={animated ? 0.75 : 0.3}
      strokeWidth="3.2"
      strokeLinecap="round"
      fill="none"
    >
      <path d={`M ${x - spread} ${y} c -5 -10 6 -14 1 -24`} />
      <path d={`M ${x} ${y - 5} c -6 -12 7 -16 1 -28`} />
      <path d={`M ${x + spread} ${y} c -5 -10 6 -14 1 -24`} />
    </g>
  );
}

function Sesame({ points }: { points: [number, number][] }) {
  return (
    <g fill="#fff2d4" fillOpacity="0.9">
      {points.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2.1" ry="1.4" transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
    </g>
  );
}

function Broccoli({ x, y, s = 1, id }: { x: number; y: number; s?: number; id: (k: string) => string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-4" y="0" width="8" height="11" rx="3.5" fill="#b9d08a" />
      <path
        d="M -15 0 a 8 8 0 0 1 5 -12 a 9 9 0 0 1 20 -3 a 8 8 0 0 1 5 15 Z"
        fill={`url(#${id('green')})`}
      />
      <circle cx="-7" cy="-6" r="3" fill="#7fc06d" fillOpacity="0.6" />
      <circle cx="4" cy="-9" r="2.4" fill="#7fc06d" fillOpacity="0.5" />
    </g>
  );
}

function Chili({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M 0 0 c 10 1 17 6 18 13 c -9 2 -18 -3 -18 -13 Z" fill="#c0221f" />
      <path d="M 0 0 l -5 -4" stroke="#4f7d31" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Scallion({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <ellipse rx="4.4" ry="3" fill="#4f9e46" />
      <ellipse rx="2" ry="1.3" fill="#dff0c4" />
    </g>
  );
}

/* ------------------------------------------------------------------ scenes */

function Scene({ kind, id }: { kind: ArtKind; id: (k: string) => string }) {
  switch (kind) {
    /* ---------------------------------------------------------- noodles */
    case 'noodles':
      return (
        <>
          <Steam />
          <Bowl id={id} />
          <g clipPath="none">
            {/* mound of noodles above the rim */}
            <path d="M 45 112 a 55 34 0 0 1 110 0 Z" fill="#e6b862" />
            <g stroke="#f2cf88" strokeWidth="4.5" strokeLinecap="round" fill="none">
              <path d="M 52 108 c 14 -18 32 -22 48 -18" />
              <path d="M 64 112 c 8 -24 34 -30 52 -20" />
              <path d="M 86 111 c 2 -22 24 -30 44 -18" />
              <path d="M 108 112 c 6 -18 24 -20 38 -8" />
            </g>
            <g stroke="#c08e3c" strokeWidth="2" strokeLinecap="round" fill="none" strokeOpacity="0.8">
              <path d="M 58 110 c 14 -16 30 -20 44 -16" />
              <path d="M 92 111 c 4 -18 26 -24 42 -14" />
            </g>
            {/* chopsticks lifting a strand */}
            <g transform="rotate(-24 150 60)">
              <rect x="140" y="18" width="5" height="74" rx="2.5" fill="#8a5a2b" />
              <rect x="150" y="18" width="5" height="74" rx="2.5" fill="#a06c34" />
            </g>
            <path
              d="M 129 78 c -2 12 -10 16 -14 26"
              stroke="#f2cf88"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            <Scallion x={72} y={100} r={-15} />
            <Scallion x={118} y={96} r={25} />
            <Scallion x={98} y={90} r={5} />
            <path d="M 128 100 c 8 -6 16 -5 20 2 c -8 5 -16 4 -20 -2 Z" fill={`url(#${id('meat')})`} />
          </g>
        </>
      );

    /* ------------------------------------------------------------- rice */
    case 'rice':
      return (
        <>
          <Steam y={74} spread={18} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 40 0 0 1 108 0 Z" fill="#f6ecd8" />
          <path d="M 46 112 a 54 40 0 0 1 40 -37 a 40 40 0 0 0 -22 37 Z" fill="#fffaf0" fillOpacity="0.8" />
          {/* grains + confetti of peas, carrot, egg */}
          <g>
            {RICE_SPECKS.map(([x, y, t], i) => (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx={t === 0 ? 2.6 : 3.1}
                ry={t === 0 ? 1.5 : 2.4}
                transform={`rotate(${(i * 53) % 180} ${x} ${y})`}
                fill={['#e3d2b4', '#4f9e46', '#e8873a', '#f3cd55'][t]}
              />
            ))}
          </g>
          <Scallion x={80} y={84} r={-20} />
          <Scallion x={120} y={88} r={30} />
        </>
      );

    /* ------------------------------------------------------------- soup */
    case 'soup':
      return (
        <>
          <Steam y={82} spread={22} />
          <Bowl id={id} w={70} y={116} />
          <ellipse cx="100" cy="116" rx="62" ry="13" fill="#e0ae52" />
          <ellipse cx="100" cy="115" rx="58" ry="11" fill="#eec46e" />
          {/* wontons floating */}
          {[
            [76, 113, -12],
            [104, 118, 8],
            [126, 111, 20],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <path d="M -13 3 c 2 -9 8 -12 13 -12 c 5 0 11 3 13 12 c -6 4 -20 4 -26 0 Z" fill="#f7ecd4" />
              <path d="M -13 3 c 6 4 20 4 26 0 c -4 5 -22 5 -26 0 Z" fill="#e0cca6" />
              <path d="M -6 -5 c 3 -3 9 -3 12 0" stroke="#cbb188" strokeWidth="1.6" fill="none" />
            </g>
          ))}
          <Scallion x={90} y={106} r={-25} />
          <Scallion x={115} y={122} r={15} />
          <Scallion x={64} y={119} r={40} />
        </>
      );

    /* ------------------------------------------------------------ wings */
    case 'wings':
      return (
        <>
          <Plate id={id} />
          {[
            [72, 118, -28],
            [100, 126, 6],
            [128, 116, 30],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <rect x="-4" y="-30" width="9" height="20" rx="4" fill="#f0e2c6" />
              <circle cx="0" cy="0" r="18" fill={`url(#${id('gold')})`} />
              <path d="M -18 0 a 18 18 0 0 0 36 0 Z" fill="#a5701f" fillOpacity="0.45" />
              <circle cx="-6" cy="-7" r="6" fill="#ffe4a6" fillOpacity="0.5" />
            </g>
          ))}
          <Sesame
            points={[
              [66, 110],
              [80, 122],
              [100, 116],
              [110, 130],
              [126, 108],
              [136, 122],
              [92, 130],
            ]}
          />
          <Steam y={70} spread={16} />
        </>
      );

    /* ------------------------------------------------------------- ribs */
    case 'ribs':
      return (
        <>
          <Plate id={id} />
          {[
            [70, 128, -14],
            [100, 118, -4],
            [130, 126, 12],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <rect x="-13" y="-34" width="26" height="46" rx="11" fill={`url(#${id('sauce')})`} />
              <rect x="-13" y="-34" width="10" height="46" rx="9" fill="#fff" fillOpacity="0.16" />
              <rect x="-4" y="10" width="8" height="12" rx="4" fill="#f2e6cc" />
              <ellipse cx="0" cy="-22" rx="7" ry="4" fill="#ffb26b" fillOpacity="0.35" />
            </g>
          ))}
          <Sesame
            points={[
              [76, 108],
              [94, 100],
              [112, 112],
              [126, 104],
            ]}
          />
          <Steam y={72} spread={18} />
        </>
      );

    /* ------------------------------------------------------------ rolls */
    case 'rolls':
      return (
        <>
          <Plate id={id} />
          {[
            [82, 122, -34],
            [112, 130, -22],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <rect x="-16" y="-42" width="32" height="84" rx="16" fill={`url(#${id('gold')})`} />
              <rect x="-16" y="-42" width="12" height="84" rx="12" fill="#ffe6ae" fillOpacity="0.4" />
              <ellipse cx="0" cy="-42" rx="16" ry="6" fill="#c9902f" />
              <ellipse cx="0" cy="-42" rx="11" ry="4" fill="#8fae5a" />
              <ellipse cx="-3" cy="-43" rx="4" ry="2" fill="#d9b06e" />
            </g>
          ))}
          {/* dipping cup */}
          <g transform="translate(146 140)">
            <ellipse rx="18" ry="7" fill="#f3e7d2" />
            <path d="M -18 0 a 18 12 0 0 0 36 0 Z" fill="#e2d2b6" />
            <ellipse rx="14" ry="5" fill="#a8241c" />
          </g>
          <Steam x={96} y={70} spread={16} />
        </>
      );

    /* --------------------------------------------------------- dumpling */
    case 'dumpling':
      return (
        <>
          <Plate id={id} />
          {[
            [74, 124, -12],
            [104, 132, 4],
            [130, 120, 16],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <path d="M -22 4 c 0 -18 10 -26 22 -26 c 12 0 22 8 22 26 c -12 8 -32 8 -44 0 Z" fill="#f8eeda" />
              <path d="M -22 4 c 12 8 32 8 44 0 c -4 8 -40 8 -44 0 Z" fill="#dcc9a4" />
              <g stroke="#cdb289" strokeWidth="2" fill="none" strokeLinecap="round">
                <path d="M -13 -12 c 2 -6 6 -9 6 -12" />
                <path d="M -1 -17 c 0 -5 1 -8 1 -11" />
                <path d="M 12 -13 c -1 -6 -4 -9 -5 -12" />
              </g>
              <ellipse cx="-7" cy="-10" rx="6" ry="4" fill="#fff" fillOpacity="0.45" />
            </g>
          ))}
          <Steam y={74} spread={18} />
        </>
      );

    /* ----------------------------------------------- crispy sauced dish */
    case 'crispy':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 34 0 0 1 108 0 Z" fill="#9c3a12" />
          {NUGGETS.map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path d="M -13 0 c -3 -9 3 -15 12 -14 c 10 -1 16 6 13 14 c -6 6 -19 6 -25 0 Z" fill={`url(#${id('sauce')})`} />
              <path d="M -8 -8 c 3 -3 9 -4 13 -1" stroke="#ffc584" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeOpacity="0.85" />
            </g>
          ))}
          <Broccoli x={62} y={96} s={0.85} id={id} />
          <Broccoli x={140} y={100} s={0.75} id={id} />
          <Chili x={112} y={86} r={-20} />
          <Sesame
            points={[
              [82, 92],
              [98, 104],
              [120, 96],
              [90, 108],
              [130, 108],
            ]}
          />
        </>
      );

    /* ------------------------------ glazed: orange / sesame / honey garlic */
    case 'glazed':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 34 0 0 1 108 0 Z" fill="#a5740f" />
          {NUGGETS.map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path
                d="M -12 1 c -4 -8 1 -15 11 -14 c 10 -1 15 6 12 14 c -6 5 -18 5 -23 0 Z"
                fill={`url(#${id('gold')})`}
              />
              <path
                d="M -7 -8 c 3 -3 9 -4 13 -1"
                stroke="#ffeab8"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
            </g>
          ))}
          <Sesame
            points={[
              [70, 96],
              [84, 90],
              [98, 100],
              [112, 92],
              [126, 100],
              [90, 110],
              [116, 110],
              [136, 92],
              [104, 86],
            ]}
          />
          <Scallion x={64} y={100} r={-20} />
          <Scallion x={140} y={104} r={25} />
          <Broccoli x={132} y={90} s={0.7} id={id} />
        </>
      );

    /* --------------------------------------------------------- broccoli */
    case 'broccoli':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 32 0 0 1 108 0 Z" fill="#6a4425" />
          {/* meat slices */}
          {[
            [76, 100, -18],
            [104, 106, 10],
            [128, 98, 24],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <path d="M -16 0 c 0 -7 8 -11 16 -11 c 9 0 16 4 16 11 c -8 5 -24 5 -32 0 Z" fill={`url(#${id('meat')})`} />
              <path d="M -10 -6 c 5 -3 14 -3 19 0" stroke="#c98564" strokeWidth="2" fill="none" strokeLinecap="round" strokeOpacity="0.7" />
            </g>
          ))}
          <Broccoli x={66} y={94} s={1} id={id} />
          <Broccoli x={100} y={84} s={1.1} id={id} />
          <Broccoli x={136} y={96} s={0.9} id={id} />
        </>
      );

    /* ----------------------------------------------------------- shrimp */
    case 'shrimp':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 32 0 0 1 108 0 Z" fill="#8b5a3c" />
          {[
            [72, 100, -20, 1],
            [104, 106, 8, 1.15],
            [132, 96, 26, 0.9],
          ].map(([x, y, r, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
              <path
                d="M -14 2 a 14 14 0 1 1 22 -11 c -6 -2 -12 1 -12 6 c 0 6 6 8 11 6 a 15 15 0 0 1 -21 -1 Z"
                fill="#f08a63"
              />
              <path d="M -14 2 a 14 14 0 0 0 14 8" stroke="#c65c38" strokeWidth="2.4" fill="none" />
              <path d="M 12 -14 l 8 -5 l -3 8 Z" fill="#f5a482" />
              <circle cx="6" cy="-11" r="1.6" fill="#5a2318" />
            </g>
          ))}
          <Broccoli x={132} y={110} s={0.6} id={id} />
          <Scallion x={86} y={90} r={-20} />
        </>
      );

    /* ------------------------------------------------------- egg foo yg */
    case 'eggfoo':
      return (
        <>
          <Plate id={id} />
          {[
            [98, 128, 1],
            [100, 112, 0.95],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <ellipse rx="42" ry="17" fill="#f0c65a" />
              <ellipse cy="-4" rx="42" ry="15" fill="#f8dc8c" />
              <ellipse cx="-14" cy="-8" rx="12" ry="5" fill="#fdeec0" fillOpacity="0.8" />
              <ellipse cx="12" cy="-2" rx="6" ry="3" fill="#c58f2f" fillOpacity="0.5" />
            </g>
          ))}
          {/* gravy */}
          <path
            d="M 62 106 c 10 8 24 12 38 12 c 16 0 30 -5 40 -13 c 4 8 -2 16 -12 19 c -18 6 -44 6 -60 -1 c -8 -4 -10 -11 -6 -17 Z"
            fill="#7a4a20"
            fillOpacity="0.85"
          />
          <g fill="#4f9e46">
            <circle cx="80" cy="112" r="3" />
            <circle cx="106" cy="116" r="3" />
            <circle cx="124" cy="109" r="2.6" />
          </g>
          <Steam y={76} spread={20} />
        </>
      );

    /* -------------------------------------------------------------- veg */
    case 'veg':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 32 0 0 1 108 0 Z" fill="#3f5c33" />
          {/* carrot coins */}
          {[
            [70, 106],
            [128, 104],
            [110, 112],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r="8" fill="#e8873a" />
              <circle r="4" fill="#f6ad6a" />
            </g>
          ))}
          {/* snow peas */}
          {[
            [86, 112, -25],
            [140, 112, 20],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <path d="M -16 0 c 0 -7 7 -10 16 -10 c 9 0 16 3 16 10 c -8 4 -24 4 -32 0 Z" fill="#8fc96b" />
            </g>
          ))}
          <Broccoli x={64} y={92} s={0.95} id={id} />
          <Broccoli x={100} y={84} s={1.1} id={id} />
          <Broccoli x={136} y={94} s={0.85} id={id} />
        </>
      );

    /* ------------------------------------------------------------- tofu */
    case 'tofu':
      return (
        <>
          <Steam y={76} spread={20} />
          <Bowl id={id} />
          <path d="M 46 112 a 54 32 0 0 1 108 0 Z" fill="#4d5f2d" />
          {[
            [72, 104, -12],
            [100, 96, 6],
            [126, 106, 16],
            [112, 112, -8],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <rect x="-13" y="-13" width="26" height="26" rx="4" fill="#f3e0a8" />
              <rect x="-13" y="-13" width="26" height="9" rx="4" fill="#fbf1cd" />
              <rect x="-13" y="4" width="26" height="9" rx="4" fill="#d3b571" />
            </g>
          ))}
          <Broccoli x={60} y={92} s={0.8} id={id} />
          <Broccoli x={142} y={96} s={0.7} id={id} />
          <Scallion x={90} y={116} r={-20} />
        </>
      );

    /* ---------------------------------------------------------- platter */
    case 'platter':
      return (
        <>
          <g transform="translate(0 6)">
            <rect x="24" y="70" width="152" height="84" rx="14" fill="#f4ead6" />
            <rect x="24" y="70" width="152" height="84" rx="14" fill="none" stroke="#c8b28f" strokeWidth="2.5" />
            <rect x="30" y="76" width="66" height="72" rx="9" fill="#e9d9ba" />
            <rect x="102" y="76" width="68" height="33" rx="9" fill="#e9d9ba" />
            <rect x="102" y="115" width="68" height="33" rx="9" fill="#e9d9ba" />
            {/* rice */}
            <path d="M 34 144 a 29 26 0 0 1 58 0 Z" fill="#fbf3e2" />
            {[
              [48, 132],
              [62, 124],
              [76, 133],
              [56, 140],
              [70, 141],
              [84, 137],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.2" fill={['#4f9e46', '#e8873a'][i % 2]} />
            ))}
            {/* noodles */}
            <g stroke="#e6b862" strokeWidth="4" fill="none" strokeLinecap="round">
              <path d="M 108 100 c 10 -12 26 -14 40 -6" />
              <path d="M 108 93 c 12 -10 30 -12 44 -4" />
              <path d="M 112 105 c 12 -6 28 -6 42 0" />
            </g>
            {/* sauced meat */}
            {[
              [118, 131],
              [136, 126],
              [154, 133],
              [128, 140],
              [148, 141],
            ].map(([x, y], i) => (
              <ellipse key={i} cx={x} cy={y} rx="9" ry="7" fill={`url(#${id('sauce')})`} />
            ))}
          </g>
          <Steam y={64} spread={26} />
        </>
      );

    /* ------------------------------------------------------------ fries */
    case 'fries':
      return (
        <>
          <g transform="translate(100 132)">
            {[-34, -20, -6, 8, 22, -27, -13, 1, 15].map((x, i) => (
              <rect
                key={i}
                x={x}
                y={-64 + (i % 3) * 7}
                width="12"
                height="72"
                rx="5"
                fill={i % 2 ? '#f0bf5c' : '#e0a53c'}
                transform={`rotate(${(x + 6) * 0.28} ${x + 6} 8)`}
              />
            ))}
            {/* carton */}
            <path d="M -42 -4 l 84 0 l -10 42 l -64 0 Z" fill="#c0281f" />
            <path d="M -42 -4 l 84 0 l -3 12 l -78 0 Z" fill="#e0453f" />
            <ellipse cy="40" rx="34" ry="6" fill="#1a0f0a" fillOpacity="0.25" />
          </g>
          <Steam y={62} spread={22} />
        </>
      );

    /* -------------------------------------------------------------- wok */
    default:
      return (
        <>
          {/* flame */}
          <g>
            <path d="M 100 172 c -22 0 -34 -14 -30 -28 c 4 8 8 10 12 10 c -6 -16 2 -28 14 -36 c -2 14 6 16 10 26 c 4 -6 4 -12 3 -18 c 12 10 20 22 20 32 c 0 8 -8 14 -29 14 Z" fill="#e0692a" fillOpacity="0.75" />
            <path d="M 100 168 c -12 0 -18 -8 -16 -16 c 3 5 5 6 7 6 c -3 -9 2 -16 9 -21 c -1 8 4 9 6 15 c 2 -3 2 -7 2 -10 c 7 6 11 12 11 18 c 0 5 -5 8 -19 8 Z" fill="#f6b93b" fillOpacity="0.9" />
          </g>
          {/* wok */}
          <path d="M 38 104 a 62 52 0 0 0 124 0 Z" fill="#2b1c17" />
          <ellipse cx="100" cy="104" rx="62" ry="15" fill="#3d2a22" />
          <ellipse cx="100" cy="104" rx="55" ry="11" fill="#1f1310" />
          <rect x="150" y="92" width="46" height="8" rx="4" fill="#5a3a26" transform="rotate(-14 150 96)" />
          {/* tossed ingredients arcing out of the wok */}
          {[
            [72, 74, 6],
            [88, 60, 7],
            [106, 54, 6],
            [124, 62, 8],
            [138, 76, 5.5],
            [96, 78, 5],
            [118, 80, 6],
          ].map(([x, y, r], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill={['#e8873a', '#4f9e46', '#c0512a', '#f0bf5c', '#8fc96b'][i % 5]}
            />
          ))}
          <Steam y={54} spread={26} />
        </>
      );
  }
}

function Plate({ id }: { id: (k: string) => string }) {
  return (
    <g>
      <ellipse cx="100" cy="140" rx="74" ry="26" fill={`url(#${id('bowl')})`} />
      <ellipse cx="100" cy="137" rx="74" ry="24" fill={`url(#${id('rim')})`} />
      <ellipse cx="100" cy="138" rx="58" ry="17" fill="#e2d0b4" />
      <path
        d="M 34 140 a 74 26 0 0 0 26 22"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.4"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="100" cy="164" rx="46" ry="6" fill="#1a0f0a" fillOpacity="0.22" />
    </g>
  );
}

/* Deterministic scatter — hand-placed so no two grains overlap awkwardly.
   [x, y, colourIndex] where 0=rice 1=pea 2=carrot 3=egg */
const RICE_SPECKS: [number, number, number][] = [
  [70, 100, 0], [82, 92, 1], [94, 86, 0], [106, 84, 2], [118, 90, 0],
  [130, 98, 3], [64, 108, 0], [76, 104, 2], [88, 98, 0], [100, 94, 1],
  [112, 96, 0], [124, 104, 0], [136, 106, 1], [70, 112, 3], [84, 110, 0],
  [98, 106, 0], [110, 108, 3], [122, 112, 2], [134, 112, 0], [92, 118, 1],
  [106, 118, 0], [120, 120, 0], [78, 120, 0], [132, 92, 0], [58, 106, 1],
];

/* [x, y, scale] */
const NUGGETS: [number, number, number][] = [
  [74, 100, 1], [98, 94, 1.15], [122, 100, 1], [86, 108, 0.9],
  [110, 108, 1], [134, 106, 0.85], [62, 108, 0.8],
];
