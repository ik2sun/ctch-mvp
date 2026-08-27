// Resend API로 메일을 보낸다. 별도 SDK 없이 fetch로 직접 호출한다.
// RESEND_API_KEY가 없으면 발송을 시도하지 않고 에러를 던진다(호출부에서 잡아서 실패 로그로 남김).

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY가 설정되지 않았어요.");

  const from = process.env.RESEND_FROM_EMAIL || "CTCH 알림 <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`메일 발송 실패 (${res.status}): ${body}`);
  }
}
