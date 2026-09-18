import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";

export const Caption: React.FC<{ text: string; audioFrames: number }> = ({ text, audioFrames }) => {
  const frame = useCurrentFrame();
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const total = sentences.reduce((a, s) => a + s.length, 0);
  let acc = 0;
  let current = "";
  let start = 0;
  let end = 0;
  for (const s of sentences) {
    const from = (acc / total) * audioFrames;
    acc += s.length;
    const to = (acc / total) * audioFrames;
    if (frame >= from && frame < to + 6) {
      current = s;
      start = from;
      end = to;
      break;
    }
  }
  if (!current) return null;
  const opacity = interpolate(frame, [start, start + 6, end - 2, end + 6], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [start, start + 8], [16, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 190,
        textAlign: "center",
        color: C.white,
        fontSize: 54,
        fontWeight: 800,
        lineHeight: 1.4,
        wordBreak: "keep-all",
        textShadow: "0 4px 24px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      {current}
    </div>
  );
};
