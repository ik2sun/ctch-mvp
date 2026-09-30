import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGfaCredentials, GfaAuthError } from "@/lib/gfa/auth";
import { fetchAdAccount, fetchManagerChildAdAccounts, fetchMyAdAccounts } from "@/lib/gfa/aggregate";

export const maxDuration = 60;

// 공용 GFA 연결로 접근 가능한 광고계정 목록 — 광고주 매체 연동에서 광고계정 번호를 고르는 용도.
// 관리 계정 하위 광고계정(번호만 옴 → 이름은 개별 조회, 최대 150개) + 연결한 아이디가 직접 멤버인 광고계정
const NAME_LOOKUP_MAX = 150;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let creds;
  try {
    creds = await getGfaCredentials(null, false);
  } catch (e) {
    const linked = !(e instanceof GfaAuthError && (e.code === "NOT_LINKED" || e.code === "NOT_CONFIGURED"));
    return NextResponse.json({ linked, accounts: [], error: linked && e instanceof Error ? e.message : undefined });
  }

  try {
    const byNo = new Map<string, string>();
    for (const a of await fetchMyAdAccounts(creds.accessToken)) byNo.set(String(a.no), a.name);

    if (creds.managerAccountNo) {
      const { adAccountNos } = await fetchManagerChildAdAccounts(creds.accessToken, creds.managerAccountNo);
      const unnamed = adAccountNos.filter((no) => !byNo.has(no));
      for (const no of unnamed.slice(NAME_LOOKUP_MAX)) byNo.set(no, "");
      const targets = unnamed.slice(0, NAME_LOOKUP_MAX);
      for (let i = 0; i < targets.length; i += 5) {
        await Promise.all(
          targets.slice(i, i + 5).map(async (no) => {
            const a = await fetchAdAccount({ ...creds, adAccountNo: no }).catch(() => null);
            byNo.set(no, a?.name ?? "");
          }),
        );
      }
    }

    const accounts = [...byNo.entries()].map(([id, name]) => ({ id, name: name || `광고계정 ${id}` })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return NextResponse.json({ linked: true, managerAccountNo: creds.managerAccountNo, accounts });
  } catch (e) {
    return NextResponse.json({ linked: true, accounts: [], error: e instanceof Error ? e.message : "광고계정 목록을 불러오지 못했어요." });
  }
}
