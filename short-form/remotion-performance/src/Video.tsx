import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansKR";
import script from "../public/audio/script.json";
import { Caption } from "./components/Caption";
import { Vignette } from "./components/Backdrop";
import { Intro } from "./scenes/Intro";
import { Problem } from "./scenes/Problem";
import { MediaSplit } from "./scenes/MediaSplit";
import { WinningKey } from "./scenes/WinningKey";
import { Outro } from "./scenes/Outro";
import { SCENES } from "./timeline";
import { C } from "./theme";

const { fontFamily } = loadFont("normal", { weights: ["700", "900"], ignoreTooManyRequestsWarning: true });

const Fade: React.FC<{ children: React.ReactNode; out?: boolean }> = ({ children, out = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = out
    ? interpolate(frame, [0, 10, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const PerformanceShort: React.FC = () => {
  const [s1, s2, s3, s4, s5] = SCENES;
  const text = (id: string) => script.find((s) => s.id === id)?.text ?? "";
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily, color: C.white }}>
      <Sequence from={s1.from} durationInFrames={s1.durationInFrames} name="1 도입">
        <Fade><Intro /></Fade>
        <Audio src={staticFile("audio/s1.mp3")} />
        <Caption text={text("s1")} audioFrames={s1.audioFrames} />
      </Sequence>
      <Sequence from={s2.from} durationInFrames={s2.durationInFrames} name="2 난관">
        <Fade><Problem /></Fade>
        <Audio src={staticFile("audio/s2.mp3")} />
        <Caption text={text("s2")} audioFrames={s2.audioFrames} />
      </Sequence>
      <Sequence from={s3.from} durationInFrames={s3.durationInFrames} name="3-1 매체 최적화">
        <Fade><MediaSplit /></Fade>
        <Audio src={staticFile("audio/s3.mp3")} />
        <Caption text={text("s3")} audioFrames={s3.audioFrames} />
      </Sequence>
      <Sequence from={s4.from} durationInFrames={s4.durationInFrames} name="3-2 위닝 소재">
        <Fade><WinningKey /></Fade>
        <Audio src={staticFile("audio/s4.mp3")} />
        <Caption text={text("s4")} audioFrames={s4.audioFrames} />
      </Sequence>
      <Sequence from={s5.from} durationInFrames={s5.durationInFrames} name="4 결론">
        <Fade out={false}><Outro audioFrames={s5.audioFrames} /></Fade>
        <Audio src={staticFile("audio/s5.mp3")} />
        <Caption text={text("s5")} audioFrames={s5.audioFrames} />
      </Sequence>
      <Vignette />
    </AbsoluteFill>
  );
};
