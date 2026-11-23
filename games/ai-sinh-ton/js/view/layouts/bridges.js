// Bridges: the classic corridor of five pads joined by plank bridges and stairs (the map every stage had before layouts).
export const BRIDGES = {
  gap: 5, sats: true,
  yRange: (water) => (water ? [0, 3] : [-4, 4]),
  abyss: (th) => th.abyss,
  raft: null,
  extras: () => null,
};
