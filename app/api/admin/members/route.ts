import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/supabase/profile";

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (caller?.role !== "superadmin") {
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  }

  const { userId, action, role } = await req.json();
  if (!userId || !action) {
    return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  }

  if ((action === "approve" || action === "setRole") && !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "허용되지 않은 역할이에요." }, { status: 400 });
  }

  const admin = createAdminClient();
  let update: { status?: string; role?: Role };
  if (action === "approve") update = { status: "approved", role };
  else if (action === "reject") update = { status: "rejected" };
  else if (action === "setRole") update = { role };
  else return NextResponse.json({ error: "알 수 없는 동작이에요." }, { status: 400 });

  const { error } = await admin.from("profiles").update(update).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
