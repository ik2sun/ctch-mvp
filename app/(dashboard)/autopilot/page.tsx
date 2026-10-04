import { redirect } from "next/navigation";

// 캠페인 오토파일럿 — 상위 경로는 첫 하위 메뉴로
export default function AutopilotIndex() {
  redirect("/autopilot/setup");
}
