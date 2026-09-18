import React from "react";
import { C } from "../theme";

export const Marble: React.FC<{
  x: number;
  y: number;
  size?: number;
  color?: string;
  glow?: string;
  deep?: string;
  opacity?: number;
}> = ({ x, y, size = 28, color = C.blue, glow = C.blueGlow, deep = C.blueDeep, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${glow} 18%, ${color} 55%, ${deep} 100%)`,
      boxShadow: `0 0 ${size * 0.7}px ${glow}66`,
      opacity,
    }}
  />
);
