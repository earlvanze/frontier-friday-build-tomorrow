// Frontier Friday edit, by section (the director reads the [section] tags in data/lyrics.json).
// The story: a neural spark becomes a signal, the signal becomes a plan, the plan becomes a street, a house, a ledger,
// a chain, a city — and every chorus the same city has grown. Ends on the opening spark.
// Count-0 specs are instrumental shots placed at { at } or { afterPrev } seconds.
export type Spec = [kind: string, lines: number, opts?: Record<string, any>];

// plates (pdoom: each set piece has its own idiom): verse = engraving / scope / terminal / UI / blueprint / contour,
// chorus = halftone hook, guilloché Earl Co, blueprint morph, ledger-paper build log, scope flow, contour second hook.
const chorus = (n: number): Spec[] => [
  ['hook', 1, { n, v: 0, plate: 'halftone' }], // FRONTIER FRIDAY here we go (skyline at stage n)
  ['earl', 1, { n, plate: 'guilloche', plateLabel: 'FRONTIER FRIDAY · EARL CO' }], // with Earl Co · watch ideas GROW
  ['morph', 1, { n, plate: 'blueprint', plateLabel: 'BRICKS → BLOCKS → CODE → KEYS' }], // bricks -> blocks -> code -> keys
  ['tomorrow', 1, { n, holdAfter: 1.0, holdClamp: true, plate: 'ledger', plateLabel: 'BUILD LOG' }], // TOMORROW assembled piece by piece
  ['city', 1, { n }], // AI · TECH signs, the cities glow (pan)
  ['flow', 1, { n, plate: 'scope' }], // crypto moving, letters ride the flow
  ['hook', 1, { n, v: 1, plate: 'contour' }], // second hook: swung perspective
  ['future', 1, { n }], // see the FUTURE with Earl Co (horizon)
];

export const SECTIONS: Record<string, (occ: number, count: number) => Spec[]> = {
  verse: (o, c) =>
    c === 12
      ? o === 1
        ? [['boot', 0, { at: 0 }], ['neural', 2, { holdAfter: 0.75, holdClamp: true, plate: 'engrave' }], ['wire', 2, { plate: 'scope' }], ['learn', 2, { plate: 'terminal' }], ['prompt', 2, { holdAfter: 0.75, holdClamp: true, plate: 'ui', plateLabel: 'prompt — frontier.app' }], ['zoom', 2, { n: 1, plate: 'blueprint', plateLabel: 'DETAIL 1 · ZOOM' }], ['edge', 2, { n: 1, plate: 'contour' }]]
        : [['plan', 2, { bg: { paper: 1 } }], ['windows', 2, { plate: 'blueprint', plateLabel: 'ELEVATION · WINDOWS / FOUNDATION' }], ['unlock', 2, { plate: 'blueprint', plateLabel: 'SECTION B-B · FLOOR 02' }], ['ledger', 2, { plate: 'ledger', plateLabel: 'RENT ROLL' }],
           ['zoom', 2, { n: 2, plate: 'blueprint', plateLabel: 'DETAIL 2 · ZOOM' }], ['edge', 2, { n: 2, plate: 'contour' }]]
      : [['slam', c]],
  chorus: (n, c) => (c === 8 ? [...chorus(n), ...(n === 2 ? ([['skyline', 0, { afterPrev: 2.0 }]] as Spec[]) : [])] : [['slam', c]]),
  bridge: (_o, c) => (c === 8 ? [['chain', 2, { plate: 'terminal' }], ['vote', 2, { bg: { paper: 1 } }], ['frame', 2, { plate: 'ui', plateLabel: 'frame — 16:9 → 1:1' }], ['spark', 2, { plate: 'engrave' }]] : [['slam', c]]),
  outro: (_o, c) => (c === 3 ? [['future', 1, { n: 4, plate: 'halftone', signFlip: true, lightsAt: 167.0 }], ['finale', 1, { plate: 'engrave' }], ['endcard', 1]] : [['slam', c]]),
};
