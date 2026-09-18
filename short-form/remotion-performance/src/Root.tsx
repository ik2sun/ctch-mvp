import { Composition } from "remotion";
import { PerformanceShort } from "./Video";
import { FPS, H, TOTAL_FRAMES, W } from "./timeline";

export const Root: React.FC = () => (
  <Composition
    id="PerformanceShort"
    component={PerformanceShort}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={W}
    height={H}
  />
);
