import durations from "../public/audio/durations.json";

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const TOTAL_FRAMES = 60 * FPS;

const GAP = 0.45;
const LEAD = 0.35;

let t = LEAD;
export const SCENES = durations.map((d, i) => {
  const from = Math.round(t * FPS);
  const audioFrames = Math.round(d.duration * FPS);
  t += d.duration + GAP;
  const isLast = i === durations.length - 1;
  const durationInFrames = isLast ? TOTAL_FRAMES - from : Math.round((d.duration + GAP) * FPS);
  return { id: d.id, from, audioFrames, durationInFrames };
});
