import type { Device, PowerLinkAd } from "./rankChecker";
import { sendEmail } from "@/lib/email/resend";

const DEVICE_LABEL: Record<Device, string> = { pc: "PC", mobile: "모바일" };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adRow(ad: PowerLinkAd): string {
  return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${ad.rank}위</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(ad.business || ad.title || "")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(ad.domain)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555;">${escapeHtml(ad.description || ad.title || "")}</td>
    </tr>`;
}

export async function sendBrandInfringementAlert(input: {
  to: string | string[];
  clientName: string;
  keyword: string;
  ownerDomain: string;
  device: Device;
  infringingAds: PowerLinkAd[];
  checkedAt: string;
}): Promise<void> {
  const { to, clientName, keyword, ownerDomain, device, infringingAds, checkedAt } = input;
  const checkedAtLabel = new Date(checkedAt).toLocaleString("ko-KR");

  const html = `
  <div style="font-family:'Malgun Gothic',sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#c0392b;">브랜드 키워드 타사 노출 감지</h2>
    <p><b>${escapeHtml(clientName)}</b>의 브랜드 키워드 <b>"${escapeHtml(keyword)}"</b>에서
      광고주 도메인(<b>${escapeHtml(ownerDomain)}</b>)이 아닌 타사 파워링크 광고가 <b>${DEVICE_LABEL[device]}</b>에서 발견됐어요.</p>
    <p style="color:#888;font-size:13px;">확인 시각: ${escapeHtml(checkedAtLabel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
      <thead>
        <tr style="background:#f7f7f7;text-align:left;">
          <th style="padding:8px 10px;">순위</th>
          <th style="padding:8px 10px;">업체명</th>
          <th style="padding:8px 10px;">도메인</th>
          <th style="padding:8px 10px;">광고문구</th>
        </tr>
      </thead>
      <tbody>${infringingAds.map(adRow).join("")}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">
      이 메일은 CTCH 브랜드 키워드 모니터링이 자동으로 발송했어요. 동일한 타사 노출이 계속되는 동안은 재발송하지 않고,
      새로운 타사가 추가로 노출될 때만 다시 알려드려요.
    </p>
  </div>`;

  await sendEmail({
    to,
    subject: `[CTCH] "${keyword}" 브랜드 키워드에 타사 노출 감지 (${clientName})`,
    html,
  });
}
