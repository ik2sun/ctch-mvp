import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "이미지 URL이 필요합니다." }, { status: 400 });
  }

  try {
    const imageRes = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!imageRes.ok) {
      return NextResponse.json({ error: "이미지를 불러오지 못했습니다." }, { status: imageRes.status || 500 });
    }

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imageRes.arrayBuffer();

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("proxy-image error:", error);
    return NextResponse.json({ error: "프록시 이미지 로딩에 실패했습니다." }, { status: 500 });
  }
}
