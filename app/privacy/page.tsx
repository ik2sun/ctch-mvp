import type { Metadata } from "next";

// 개인정보처리방침 — 메타 개발자 앱(NMG-CTCH) 게시에 필요한 공개 페이지. 로그인 없이 열린다(lib/supabase/middleware.ts에서 이 경로만 예외)
// 데이터는 넣지 않는다. 내용을 바꾸면 시행일도 바꾼다
export const metadata: Metadata = {
  title: "개인정보처리방침 · CTCH",
  description: "넥스트미디어그룹 CTCH 개인정보처리방침",
};

const UPDATED = "2026-10-09";
const CONTACT = "k2s@nmg.co.kr";

const SECTIONS: { title: string; en: string; body: string[] }[] = [
  {
    title: "1. 서비스 개요",
    en: "Overview",
    body: [
      "CTCH(캐치)는 넥스트미디어그룹(NMG)이 내부 업무용으로 운영하는 퍼포먼스 마케팅 대시보드입니다.",
      "회사 구글 계정(@nmg.co.kr)으로 로그인한 임직원만 사용할 수 있으며, 일반 이용자에게 공개된 서비스가 아닙니다.",
    ],
  },
  {
    title: "2. 처리하는 정보",
    en: "Information we process",
    body: [
      "로그인 정보: 회사 구글 계정의 이메일 주소, 이름, 프로필 사진, 최근 접속 시각",
      "광고 운영 정보: 담당자가 연동한 광고 플랫폼(Meta, Google, Naver, Kakao 등)의 광고계정·캠페인·광고세트·광고 설정과 성과 지표, 맞춤 타겟 이름 등 광고 관리에 필요한 정보",
      "업로드 소재: 광고 세팅을 위해 담당자가 올린 이미지·영상 파일과 광고 문구",
      "CTCH는 광고를 본 일반 이용자의 개인을 식별할 수 있는 정보를 수집하거나 저장하지 않습니다. 광고 플랫폼에서 받는 성과 정보는 집계된 수치입니다.",
    ],
  },
  {
    title: "3. 이용 목적",
    en: "Purpose of use",
    body: [
      "광고 성과 조회·분석, 리포트 작성, 광고 캠페인·광고세트·광고의 생성과 관리(담당자가 확인·승인한 작업만 실행), 서비스 접근 권한 관리",
    ],
  },
  {
    title: "4. 보관 및 파기",
    en: "Retention and deletion",
    body: [
      "광고 설정·성과 정보는 업무에 필요한 기간 동안 보관하며, 광고주 연동을 해제하거나 삭제 요청이 있으면 지체 없이 삭제합니다.",
      "광고 플랫폼에 전달하기 위해 임시로 저장한 영상 파일은 전달이 끝나면 삭제합니다.",
      "외부 서비스 연동 토큰은 연동 해제 시 삭제합니다.",
    ],
  },
  {
    title: "5. 제3자 제공",
    en: "Sharing",
    body: [
      "처리하는 정보를 판매하거나 광고 목적으로 제3자에게 제공하지 않습니다.",
      "광고 생성·관리를 위해 담당자가 지시한 내용만 해당 광고 플랫폼(예: Meta Marketing API)에 전달합니다. 서비스 운영을 위해 클라우드 호스팅(Vercel)과 데이터베이스(Supabase)를 이용합니다.",
    ],
  },
  {
    title: "6. 삭제 요청 및 문의",
    en: "Data deletion requests and contact",
    body: [
      `정보의 열람·정정·삭제를 원하시면 ${CONTACT}로 요청해 주세요. 확인 후 지체 없이 처리하고 결과를 회신합니다.`,
      "Meta 연동 해제: Meta 비즈니스 설정에서 CTCH 앱(NMG-CTCH)의 접근 권한을 제거하면 이후 데이터 수집이 중단되며, 위 이메일로 요청하면 저장된 데이터를 삭제합니다.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-[760px]">
        <p className="text-[14px] font-semibold text-[#eb6834]">CTCH · 넥스트미디어그룹</p>
        <h1 className="mt-2 text-[28px] font-bold text-ink">개인정보처리방침</h1>
        <p className="mt-1 text-[15px] text-ink-muted">Privacy Policy · 시행일 {UPDATED}</p>

        <div className="mt-10 space-y-9">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-[19px] font-bold text-ink">
                {s.title} <span className="text-[14px] font-normal text-ink-muted">{s.en}</span>
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-soft">
                {s.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-xl bg-[#F9FAFB] p-5 text-[14px] leading-relaxed text-ink-soft">
          <p className="font-semibold text-ink">Summary (English)</p>
          <p className="mt-2">
            CTCH is an internal performance-marketing dashboard operated by Next Media Group (NMG), available only to employees signed in with a company (@nmg.co.kr) Google account. It processes
            sign-in information (email, name, profile photo), advertising account settings and aggregated performance metrics from connected ad platforms, and creative files uploaded by staff, solely to
            analyze campaigns and to create and manage ads approved by staff. We do not sell data or share it for advertising. To request access or deletion of your data, contact {CONTACT}.
          </p>
        </section>

        <p className="mt-10 text-[13px] text-ink-muted">문의 {CONTACT}</p>
      </article>
    </main>
  );
}
