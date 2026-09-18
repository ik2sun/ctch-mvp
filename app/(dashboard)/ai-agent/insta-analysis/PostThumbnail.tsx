"use client";

import { useState } from "react";
import type { InstagramPost } from "@/features/brand-analysis/apifyClient";

// 실제 썸네일이 없거나 로드 실패 시 인스타그램 느낌의 그라데이션 박스로 대체
const THUMB_GRADIENTS = [
  "linear-gradient(135deg, #ec4899, #f472b6)",
  "linear-gradient(135deg, #8b5cf6, #a78bfa)",
  "linear-gradient(135deg, #f97316, #fb923c)",
  "linear-gradient(135deg, #3b82f6, #60a5fa)",
];

export function PostThumbnail({ post, index, size = "md" }: { post: InstagramPost; index: number; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const proxyUrl = post.thumbnail ? `/api/proxy-image?url=${encodeURIComponent(post.thumbnail)}` : "";
  const icon = post.format === "reel" ? "ti-player-play" : post.format === "carousel" ? "ti-layers-subtract" : "ti-photo";

  if (!post.thumbnail || failed) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: THUMB_GRADIENTS[index % THUMB_GRADIENTS.length] }}
      >
        <i className={`ti ${icon} ${size === "sm" ? "text-[16px]" : "text-[28px]"} text-white/85`} aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={proxyUrl}
      alt={post.altText || "인스타그램 게시물 이미지"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}
