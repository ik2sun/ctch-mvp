import { redirect } from "next/navigation";

// 가입 절차 없음 — @nmg.co.kr 구글 계정으로 로그인하면 바로 열람 가능
export default function SignupPage() {
  redirect("/login");
}
