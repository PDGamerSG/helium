/**
 * Scroll choreography for the landing core, shared by the WebGL scene and the DOM overlay.
 * Distances are measured in "screens" (viewport heights of scroll).
 */

export const CORE_HEIGHT = 10;
export const CORE_RADIUS = 1.15;

export const HERO_HOLD = 0.35;
export const DIVE = 0.85;
export const DWELL = 0.75;
export const TRAVEL = 0.6;
export const EXIT = 1.1;
/** The flat core holds for this many screens before the page moves on. */
export const HOLD = 0.3;

export function journeyScreens(stops: number) {
  return HERO_HOLD + DIVE + stops * DWELL + (stops - 1) * TRAVEL + EXIT + HOLD;
}

/** Local y of a day in the core: day 0 (kickoff) at the bottom, the last day at the top. */
export function dayToY(day: number, days: number) {
  return -CORE_HEIGHT / 2 + (day / days) * CORE_HEIGHT;
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export type DrillState = {
  /** 0 overview, 1 close to the core. */
  dive: number;
  /** Fractional stop position: 0 is the first stop, 1.5 is halfway between stops 1 and 2. */
  stop: number;
  /** Index of the stop whose copy should show. */
  active: number;
  /** 0..1 fade-out of the whole drill once the last stop has been read. */
  exit: number;
};

export function drillState(screens: number, stops: number): DrillState {
  const dive = easeInOut(clamp01((screens - HERO_HOLD) / DIVE));
  let s = screens - HERO_HOLD - DIVE;
  let stop = 0;
  for (let i = 0; i < stops; i++) {
    if (s <= DWELL) break;
    s -= DWELL;
    if (i === stops - 1) break;
    if (s <= TRAVEL) {
      stop = i + easeInOut(s / TRAVEL);
      s = -1;
      break;
    }
    s -= TRAVEL;
    stop = i + 1;
  }
  const total = journeyScreens(stops);
  const exit = clamp01((screens - (total - EXIT - HOLD)) / EXIT);
  return { dive, stop, active: Math.round(stop), exit };
}

/** Scroll position (in screens) where stop `i` is centred. */
export function stopScreens(i: number) {
  return HERO_HOLD + DIVE + i * (DWELL + TRAVEL) + DWELL * 0.45;
}
