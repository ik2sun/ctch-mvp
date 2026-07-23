import { FeaturePlaceholder } from "@/components/ui/FeaturePlaceholder";

export default function Page() {
  return (
    <FeaturePlaceholder
      icon="chart-dots"
      title="상관관계 분석"
      desc="SOV·GRP·ROAS 등 지표 간 상관관계를 계산해 어떤 매체 조합이 효율적인지 보여줘요."
      step="이후 확장 예정"
      priority={false}
    />
  );
}
