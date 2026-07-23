import { FeaturePlaceholder } from "@/components/ui/FeaturePlaceholder";

export default function Page() {
  return (
    <FeaturePlaceholder
      icon="radar"
      title="경쟁사 모니터링"
      desc="경쟁사의 추정 트래픽·키워드·운영 소재 현황을 한눈에 모니터링해요."
      step="마지막 단계 · 외부 데이터 소스 필요"
      priority={false}
    />
  );
}
