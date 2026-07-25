"use client";

import { useState } from "react";
import StepIndicator from "@/components/proposal/StepIndicator";
import Step1BasicInfo from "@/components/proposal/Step1BasicInfo";
import Step2Research from "@/components/proposal/Step2Research";
import Step3Upload from "@/components/proposal/Step3Upload";
import Step4Content from "@/components/proposal/Step4Content";
import Step5Present from "@/components/proposal/Step5Present";
import type { BasicInfo, FileAnalysis, Insight, Slide } from "@/features/proposal/types";

const INITIAL_BASIC_INFO: BasicInfo = {
  clientId: null,
  clientName: "",
  industry: "이커머스",
  goal: "신규수주",
  kpi: "ROAS",
  monthlyBudget: "",
  competitorUrls: ["", "", ""],
};

export default function ProposalPage() {
  const [step, setStep] = useState(1);
  const [basicInfo, setBasicInfo] = useState<BasicInfo>(INITIAL_BASIC_INFO);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysis[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <StepIndicator step={step} />

      <div className="rounded-card border border-line bg-surface p-6">
        {step === 1 && (
          <Step1BasicInfo value={basicInfo} onChange={setBasicInfo} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2Research
            basicInfo={basicInfo}
            insights={insights}
            setInsights={setInsights}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3Upload
            fileAnalyses={fileAnalyses}
            setFileAnalyses={setFileAnalyses}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <Step4Content
            basicInfo={basicInfo}
            insights={insights}
            selectedIds={selectedIds}
            fileAnalyses={fileAnalyses}
            slides={slides}
            setSlides={setSlides}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <Step5Present
            basicInfo={basicInfo}
            clientId={basicInfo.clientId}
            slides={slides}
            onBack={() => setStep(4)}
          />
        )}
      </div>
    </div>
  );
}
