import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { clearProgress, getBrowserKey, loadProgress, randomHex, saveProgress, type LocalAssessmentProgress } from "@/lib/assessmentPersistence";
import { OperationsAssessmentReport, type AssessmentReport } from "./OperationsAssessmentReport";
import type { AssessmentRoadmap } from "./OperationsAssessmentRoadmap";
import { isQuestionApplicable } from "../../../../../convex/lib/assessmentApplicability";

type Answer = string | string[];
type Question = {
  key: string; sectionKey: string; categoryKey: string; promptKey: string; helpKey?: string;
  kind: "single" | "multi" | "text"; required: boolean; qualitative: boolean; order: number;
  maxSelections?: number; maxLength?: number; options?: { value: string; labelKey: string }[];
  applicability?: { questionKey: string; operator: "equals" | "not_equals" | "includes"; value: string };
};
type Definition = {
  _id: Id<"assessmentDefinitions">;
  sections: { key: string; titleKey: string; introKey: string; order: number }[];
  questions: Question[];
};
type AssessmentHistoryState = {
  scrubAssessment: true;
  view: "intro" | "section" | "question";
  questionKey?: string;
};
const assessmentApi = (api as any).assessments;
const continuityApi = (api as any).assessmentContinuity;
const clarityHelperKeys: Record<string, string> = {
  "business.primary_model": "assessment.clarity.closest",
  "scheduling.primary_method": "assessment.clarity.mostOften",
  "growth.primary_objective": "assessment.clarity.primaryGoal",
  "growth.bottleneck": "assessment.clarity.greatestImpact",
};

function responseArgs(question: Question, answer: Answer | undefined) {
  if (question.kind === "text") return { questionKey: question.key, qualitativeText: typeof answer === "string" ? answer : "" };
  if (question.kind === "multi") return { questionKey: question.key, answerValues: Array.isArray(answer) ? answer : [] };
  return { questionKey: question.key, answerValue: typeof answer === "string" ? answer : undefined };
}

function validatedAnswers(definition: Definition, candidate: Record<string, Answer>): Record<string, Answer> {
  const accepted: Record<string, Answer> = {};
  const ordered = [...definition.questions].sort((a, b) => {
    const sectionA = definition.sections.find((section) => section.key === a.sectionKey)?.order ?? 0;
    const sectionB = definition.sections.find((section) => section.key === b.sectionKey)?.order ?? 0;
    return sectionA - sectionB || a.order - b.order;
  });
  for (const question of ordered) {
    const value = candidate[question.key];
    if (value === undefined || !isQuestionApplicable(question, accepted)) continue;
    if (question.kind === "text" && typeof value === "string" && value.length <= (question.maxLength ?? 1500)) accepted[question.key] = value;
    if (question.kind === "single" && typeof value === "string" && question.options?.some((item) => item.value === value)) accepted[question.key] = value;
    if (question.kind === "multi" && Array.isArray(value) && value.every((item) => question.options?.some((option) => option.value === item))) accepted[question.key] = value;
  }
  return accepted;
}

export function OperationsAssessmentPage() {
  const { t, i18n } = useTranslation();
  const prepare = useMutation(assessmentApi.prepare);
  const start = useMutation(assessmentApi.start);
  const recover = useMutation(assessmentApi.recover);
  const saveResponse = useMutation(assessmentApi.saveResponse);
  const complete = useMutation(assessmentApi.complete);
  const generateReport = useMutation(assessmentApi.generateReport);
  const generateRoadmap = useMutation(assessmentApi.generateRoadmap);
  const openReturnLink = useMutation(continuityApi.openReturnLink);
  const recordEvent = useMutation(continuityApi.recordEvent);
  const abandon = useMutation(assessmentApi.abandon);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [progress, setProgress] = useState<LocalAssessmentProgress>(() => loadProgress() ?? { answers: {}, language: i18n.resolvedLanguage === "es" ? "es" : "en", lastActivityAt: Date.now() });
  const [view, setView] = useState<"intro" | "section" | "question" | "completing" | "report">("intro");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [roadmap, setRoadmap] = useState<AssessmentRoadmap | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef(progress);
  const persistenceRef = useRef<Promise<boolean> | null>(null);
  const lastSavedRef = useRef("");
  const sessionIdRef = useRef(randomHex().slice(0, 32));
  progressRef.current = progress;

  function applyHistoryState(state: AssessmentHistoryState) {
    if (state.questionKey && definition) {
      const target = questions.findIndex((item) => item.key === state.questionKey);
      if (target >= 0) setIndex(target);
    }
    setView(state.view);
    setError("");
  }

  function recordHistory(state: AssessmentHistoryState, replace = false) {
    if (replace) window.history.replaceState(state, "", window.location.href);
    else window.history.pushState(state, "", window.location.href);
    applyHistoryState(state);
  }

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as AssessmentHistoryState | null;
      if (state?.scrubAssessment) applyHistoryState(state);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  useEffect(() => {
    let active = true;
    const returnToken = new URLSearchParams(window.location.search).get("return");
    if (returnToken) {
      openReturnLink({ token: returnToken }).then(async (result: any) => { if (!active) return; await i18n.changeLanguage(result.language); setReport(result.report); setRoadmap(result.roadmap); setView("report"); }).catch(() => setError(t("assessment.continuity.invalidLink")));
      return () => { active = false; };
    }
    prepare({}).then(async (prepared: Definition) => {
      if (!active) return;
      setDefinition(prepared);
      const saved = loadProgress();
      if (saved?.attemptId && saved.capability) {
        const result = await recover({ attemptId: saved.attemptId as Id<"assessmentAttempts">, capability: saved.capability });
        if (!active) return;
        if (result) {
          void recordEvent({
            attemptId: saved.attemptId as Id<"assessmentAttempts">,
            capability: saved.capability,
            eventKey: "assessment_resumed",
            deduplicationKey: `${saved.attemptId}:assessment_resumed:${sessionIdRef.current}`,
            language: result.attempt.responseLanguage,
            metadata: { sessionId: sessionIdRef.current },
          }).catch(() => {});
          const answers: Record<string, Answer> = {};
          for (const row of result.responses) {
            if (row.responseKind === "single" && row.answerValue) answers[row.questionKey] = row.answerValue;
            if (row.responseKind === "multi" && row.answerValues) answers[row.questionKey] = row.answerValues;
            if (row.responseKind === "qualitative" && row.qualitativeText) answers[row.questionKey] = row.qualitativeText;
          }
          const next = { ...saved, answers: validatedAnswers(result.definition as Definition, { ...answers, ...saved.answers }), language: result.attempt.responseLanguage, lastActivityAt: result.attempt.lastActivityAt };
          setProgress(next);
          await i18n.changeLanguage(next.language);
          setRestored(true);
          if (result.attempt.status === "completed" && result.attempt.completionSnapshot) {
            const frozen = await generateReport({ attemptId: saved.attemptId as Id<"assessmentAttempts">, capability: saved.capability });
            setReport(frozen.payload as AssessmentReport);
            const plan = await generateRoadmap({ attemptId: saved.attemptId as Id<"assessmentAttempts">, capability: saved.capability });
            setRoadmap(plan.payload as AssessmentRoadmap);
            setView("report");
          } else {
            setView("question");
            const restoredQuestions = (result.definition as Definition).questions
              .filter((item) => isQuestionApplicable(item, next.answers))
              .sort((a, b) => {
                const sectionA = (result.definition as Definition).sections.find((section) => section.key === a.sectionKey)?.order ?? 0;
                const sectionB = (result.definition as Definition).sections.find((section) => section.key === b.sectionKey)?.order ?? 0;
                return sectionA - sectionB || a.order - b.order;
              });
            const restoredKey = next.currentQuestionKey && restoredQuestions.some((item) => item.key === next.currentQuestionKey)
              ? next.currentQuestionKey
              : restoredQuestions.find((item) => item.required && next.answers[item.key] === undefined)?.key ?? restoredQuestions[restoredQuestions.length - 1]?.key;
            window.history.replaceState({ scrubAssessment: true, view: "intro" } satisfies AssessmentHistoryState, "", window.location.href);
            let restoredSection = "";
            for (const restoredQuestion of restoredQuestions) {
              if (restoredQuestion.sectionKey !== restoredSection) {
                restoredSection = restoredQuestion.sectionKey;
                window.history.pushState({ scrubAssessment: true, view: "section", questionKey: restoredQuestion.key } satisfies AssessmentHistoryState, "", window.location.href);
              }
              window.history.pushState({ scrubAssessment: true, view: "question", questionKey: restoredQuestion.key } satisfies AssessmentHistoryState, "", window.location.href);
              if (restoredQuestion.key === restoredKey) break;
            }
          }
        } else {
          clearProgress();
          setProgress({ answers: {}, language: i18n.resolvedLanguage === "es" ? "es" : "en", lastActivityAt: Date.now() });
        }
      }
    }).catch(() => setError(t("assessment.errors.unavailable")));
    if (!(window.history.state as AssessmentHistoryState | null)?.scrubAssessment) {
      window.history.replaceState({ scrubAssessment: true, view: "intro" } satisfies AssessmentHistoryState, "", window.location.href);
    }
    return () => { active = false; };
  }, [prepare, recover, generateReport, generateRoadmap, openReturnLink, recordEvent, i18n, t]);

  const questions = useMemo(() => definition ? definition.questions.filter((question) => isQuestionApplicable(question, progress.answers)).sort((a, b) => {
    const sectionA = definition.sections.find((section) => section.key === a.sectionKey)?.order ?? 0;
    const sectionB = definition.sections.find((section) => section.key === b.sectionKey)?.order ?? 0;
    return sectionA - sectionB || a.order - b.order;
  }) : [], [definition, progress.answers]);

  useEffect(() => {
    if (!questions.length || view === "intro") return;
    const desired = progress.currentQuestionKey ? questions.findIndex((question) => question.key === progress.currentQuestionKey) : -1;
    const firstMissing = questions.findIndex((question) => question.required && progress.answers[question.key] === undefined);
    setIndex(desired >= 0 ? desired : firstMissing >= 0 ? firstMissing : Math.min(index, questions.length - 1));
  // Reconcile once the recovered/frozen question list is available.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  useEffect(() => {
    if (view === "question" || view === "section" || view === "completing") headingRef.current?.focus();
  }, [view, index]);

  useEffect(() => {
    const language = i18n.resolvedLanguage === "es" ? "es" : "en";
    document.documentElement.lang = language;
    setProgress((current) => {
      const next = { ...current, language, lastActivityAt: Date.now() } as LocalAssessmentProgress;
      if (Object.keys(next.answers).length || next.attemptId) saveProgress(next);
      return next;
    });
  }, [i18n.resolvedLanguage]);

  const question = questions[index];
  const section = definition?.sections.find((item) => item.key === question?.sectionKey);
  const sectionIndex = definition?.sections.findIndex((item) => item.key === section?.key) ?? 0;
  const sectionQuestions = questions.filter((item) => item.sectionKey === section?.key);
  const sectionQuestionIndex = sectionQuestions.findIndex((item) => item.key === question?.key);
  const clarityHelperKey = question ? clarityHelperKeys[question.key] : undefined;

  useEffect(() => {
    if (view !== "question" || !question || !progress.attemptId) return;
    void recordEvent({
      attemptId: progress.attemptId as Id<"assessmentAttempts">,
      capability: progress.capability,
      eventKey: "assessment_progress",
      deduplicationKey: `${progress.attemptId}:assessment_progress:${sessionIdRef.current}:${question.key}`,
      language: progress.language,
      metadata: { sessionId: sessionIdRef.current, sectionKey: question.sectionKey, questionKey: question.key },
    }).catch(() => {});
  }, [view, question?.key, progress.attemptId, progress.language, recordEvent]);

  function updateProgress(nextAnswers: Record<string, Answer>, currentQuestionKey = question?.key) {
    const next = { ...progressRef.current, answers: nextAnswers, currentQuestionKey, language: i18n.resolvedLanguage === "es" ? "es" as const : "en" as const, lastActivityAt: Date.now() };
    setProgress(next);
    progressRef.current = next;
    saveProgress(next);
  }

  function choose(answer: Answer) {
    if (!question || !definition) return;
    const current = progressRef.current;
    const candidate = { ...current.answers, [question.key]: answer };
    const discarded = definition.questions.filter((item) => current.answers[item.key] !== undefined && !isQuestionApplicable(item, candidate)).map((item) => item.key);
    if (discarded.length && !window.confirm(t("assessment.confirm.branchChange"))) return;
    for (const key of discarded) delete candidate[key];
    updateProgress(candidate);
    setError("");
  }

  async function persistCurrentOnce() {
    if (!question || !definition) return true;
    const latest = progressRef.current;
    if (!isQuestionApplicable(question, latest.answers)) {
      const answers = validatedAnswers(definition, latest.answers);
      const next = { ...latest, answers, currentQuestionKey: undefined, lastActivityAt: Date.now() };
      setProgress(next); progressRef.current = next; saveProgress(next);
      const visible = definition.questions.filter((item) => isQuestionApplicable(item, answers));
      const firstMissing = visible.findIndex((item) => item.required && answers[item.key] === undefined);
      setIndex(firstMissing >= 0 ? firstMissing : Math.max(0, visible.length - 1)); setView("question"); setError(t("assessment.errors.branchRefresh"));
      return false;
    }
    const answer = latest.answers[question.key];
    const empty = answer === undefined || answer === "" || (Array.isArray(answer) && !answer.length);
    if (question.required && empty) {
      setError(t("assessment.errors.required"));
      return false;
    }
    if (!latest.attemptId && empty) return true;
    setBusy(true);
    try {
      let attemptId = latest.attemptId;
      let capability = latest.capability;
      if (!attemptId) {
        capability = randomHex();
        const accepted = validatedAnswers(definition, latest.answers);
        const currentPosition = definition.questions.findIndex((item) => item.key === question.key);
        const priorResponses = definition.questions.slice(0, currentPosition).filter((item) => accepted[item.key] !== undefined && isQuestionApplicable(item, accepted)).map((item) => responseArgs(item, accepted[item.key]));
        const created = await start({ capability, browserKey: getBrowserKey(), responseLanguage: latest.language, deviceCategory: window.innerWidth < 768 ? "mobile" : "desktop", sessionId: sessionIdRef.current, priorResponses, firstResponse: responseArgs(question, answer) });
        attemptId = created.attemptId;
      } else {
        const response = responseArgs(question, answer);
        const submissionKey = `${attemptId}:${latest.language}:${JSON.stringify(response)}`;
        if (lastSavedRef.current !== submissionKey) {
          await saveResponse({ attemptId: attemptId as Id<"assessmentAttempts">, capability, responseLanguage: latest.language, response });
          lastSavedRef.current = submissionKey;
        }
      }
      const next = { ...latest, attemptId, capability, lastActivityAt: Date.now() };
      setProgress(next);
      progressRef.current = next;
      saveProgress(next);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(/rate limit|too many/i.test(message) ? t("assessment.errors.rateLimit") : t("assessment.errors.save"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function persistCurrent() {
    if (persistenceRef.current) return persistenceRef.current;
    const pending = persistCurrentOnce().finally(() => {
      if (persistenceRef.current === pending) persistenceRef.current = null;
    });
    persistenceRef.current = pending;
    return pending;
  }

  async function goNext() {
    if (!await persistCurrent()) return;
    if (index === questions.length - 1) {
      setBusy(true);
      setView("completing");
      try {
        const latest = progressRef.current;
        await complete({ attemptId: latest.attemptId as Id<"assessmentAttempts">, capability: latest.capability });
        const frozen = await generateReport({ attemptId: latest.attemptId as Id<"assessmentAttempts">, capability: latest.capability });
        setReport(frozen.payload as AssessmentReport);
        const plan = await generateRoadmap({ attemptId: latest.attemptId as Id<"assessmentAttempts">, capability: latest.capability });
        setRoadmap(plan.payload as AssessmentRoadmap);
        setView("report");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("assessment.errors.complete"));
        setView("question");
      } finally { setBusy(false); }
      return;
    }
    const nextIndex = index + 1;
    const changingSection = questions[nextIndex].sectionKey !== question.sectionKey;
    updateProgress(progressRef.current.answers, questions[nextIndex].key);
    recordHistory({ scrubAssessment: true, view: changingSection ? "section" : "question", questionKey: questions[nextIndex].key });
  }

  function beginAssessment() {
    const savedQuestion = progress.currentQuestionKey && questions.some((item) => item.key === progress.currentQuestionKey)
      ? progress.currentQuestionKey
      : questions[0]?.key;
    recordHistory({ scrubAssessment: true, view: "section", questionKey: savedQuestion });
  }

  function goBack() {
    // Answers are written to local progress as they change. Backward navigation
    // must never be gated by forward validation or a network mutation.
    window.history.go(sectionQuestionIndex === 0 ? -2 : -1);
  }

  async function startOver() {
    if (!window.confirm(t("assessment.confirm.startOver"))) return;
    if (progress.attemptId && progress.capability) await abandon({ attemptId: progress.attemptId as Id<"assessmentAttempts">, capability: progress.capability }).catch(() => {});
    clearProgress();
    setProgress({ answers: {}, language: i18n.resolvedLanguage === "es" ? "es" : "en", lastActivityAt: Date.now() });
    setIndex(0);
    setView("intro");
    setRestored(false);
    setError("");
  }

  if (view === "report" && report && roadmap) return <AssessmentShell><OperationsAssessmentReport report={report} roadmap={roadmap} attemptId={progress.attemptId} capability={progress.capability} /></AssessmentShell>;
  if (!definition && error) return <AssessmentShell><div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center text-gray-700">{error}</div></AssessmentShell>;
  if (!definition) return <AssessmentShell><p className="text-center text-gray-600">{t("common.loading")}</p></AssessmentShell>;

  if (view === "completing") return (
    <AssessmentShell>
      <main className="mx-auto max-w-2xl py-10 text-center sm:py-20">
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary-600" aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">{t("assessment.completion.eyebrow")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-bold text-gray-900 outline-none sm:text-5xl">{t("assessment.completion.title")}</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-gray-600 sm:text-lg">{t("assessment.completion.acknowledgement")}</p>
        <div role="status" className="mx-auto mt-8 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm">
          <LoaderCircle className="h-5 w-5 flex-none animate-spin text-primary-600 motion-reduce:animate-none" aria-hidden="true" />
          <div>
            <p className="font-semibold text-gray-900">{t("assessment.completion.preparing")}</p>
            <p className="mt-1 text-sm text-gray-600">{t("assessment.completion.preparingCopy")}</p>
          </div>
        </div>
      </main>
    </AssessmentShell>
  );

  if (view === "intro") return (
    <AssessmentShell>
      <main className="mx-auto max-w-5xl">
        <section className="mx-auto max-w-3xl py-4 text-center sm:py-10" aria-labelledby="assessment-intro-title">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">{t("assessment.eyebrow")}</p>
          <h1 id="assessment-intro-title" className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">{t("assessment.title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">{t("assessment.introduction")}</p>
          <p className="mx-auto mt-5 max-w-2xl rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium leading-6 text-primary-900">{t("assessment.clarity.globalGuidance")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-gray-700">
            {["free", "duration", "noAccount"].map((key) => <span key={key} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary-600" aria-hidden="true"/>{t(`assessment.meta.${key}`)}</span>)}
          </div>
          <button type="button" className="btn-primary mt-8 w-full sm:w-auto sm:px-8" onClick={beginAssessment}>{t(Object.keys(progress.answers).length ? "assessment.actions.continueAssessment" : "assessment.actions.begin")}</button>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-gray-500">{t("assessment.trust")}</p>
          {Object.keys(progress.answers).length > 0 && <button type="button" className="touch-target mt-3 text-sm text-gray-600" onClick={startOver}><RotateCcw className="h-4 w-4"/>{t("assessment.actions.startOver")}</button>}
        </section>

        <section className="mt-12 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10" aria-labelledby="assessment-value-title">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-700">{t("assessment.value.eyebrow")}</p>
          <h2 id="assessment-value-title" className="mt-2 text-3xl font-bold text-gray-900">{t("assessment.value.title")}</h2>
          <p className="mt-3 max-w-2xl leading-7 text-gray-600">{t("assessment.value.copy")}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {["score", "diagnosis", "scorecard", "roadmap", "steps"].map((key) => <div key={key} className="rounded-2xl bg-gray-50 p-4"><Check className="h-5 w-5 text-primary-600" aria-hidden="true"/><p className="mt-3 font-semibold leading-6 text-gray-900">{t(`assessment.value.items.${key}`)}</p></div>)}
          </div>
        </section>

        <section className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-start" aria-labelledby="assessment-coverage-title">
          <div><h2 id="assessment-coverage-title" className="text-3xl font-bold text-gray-900">{t("assessment.coverage.title")}</h2><p className="mt-4 leading-7 text-gray-600">{t("assessment.coverage.copy")}</p></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {["scheduling", "team", "quality", "client", "financial", "growth"].map((key) => <li key={key} className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-800"><CheckCircle2 className="h-5 w-5 flex-none text-primary-600" aria-hidden="true"/>{t(`assessment.coverage.items.${key}`)}</li>)}
          </ul>
        </section>

        <section className="mt-16 rounded-3xl bg-primary-50 p-6 sm:p-10" aria-labelledby="assessment-audience-title">
          <h2 id="assessment-audience-title" className="text-3xl font-bold text-gray-900">{t("assessment.audience.title")}</h2>
          <p className="mt-3 max-w-3xl leading-7 text-gray-700">{t("assessment.audience.copy")}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">{["solo", "team", "models"].map((key) => <p key={key} className="rounded-2xl bg-white p-5 font-semibold leading-6 text-gray-900">{t(`assessment.audience.items.${key}`)}</p>)}</div>
        </section>

        <section className="mt-16 grid gap-8 border-b border-gray-200 pb-16 lg:grid-cols-2" aria-labelledby="assessment-expectations-title">
          <div><h2 id="assessment-expectations-title" className="text-3xl font-bold text-gray-900">{t("assessment.expectations.title")}</h2><p className="mt-4 leading-7 text-gray-600">{t("assessment.expectations.copy")}</p></div>
          <ul className="space-y-4">{["honest", "optional", "result"].map((key) => <li key={key} className="flex gap-3 leading-7 text-gray-700"><Check className="mt-1 h-5 w-5 flex-none text-primary-600" aria-hidden="true"/>{t(`assessment.expectations.items.${key}`)}</li>)}</ul>
        </section>

        <section className="py-16 text-center" aria-labelledby="assessment-scrub-title">
          <h2 id="assessment-scrub-title" className="text-2xl font-bold text-gray-900">{t("assessment.scrub.title")}</h2>
          <p className="mx-auto mt-3 max-w-3xl leading-7 text-gray-600">{t("assessment.scrub.copy")}</p>
          <button type="button" className="btn-primary mt-7 w-full sm:w-auto sm:px-8" onClick={beginAssessment}>{t(Object.keys(progress.answers).length ? "assessment.actions.continueAssessment" : "assessment.actions.begin")}</button>
        </section>
      </main>
    </AssessmentShell>
  );

  if (!question || !section) return <AssessmentShell><p>{t("assessment.errors.unavailable")}</p></AssessmentShell>;

  if (view === "section") return (
    <AssessmentShell>
      <div className="mx-auto max-w-xl py-8 text-center sm:py-16">
        <p className="text-sm font-semibold text-primary-700">{t("assessment.progress.section", { current: sectionIndex + 1, total: definition!.sections.length })}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-bold text-gray-900 outline-none sm:text-4xl">{t(section.titleKey)}</h1>
        <p className="mt-5 text-base leading-7 text-gray-600">{t(section.introKey)}</p>
        <button type="button" className="btn-primary mt-8 w-full gap-2 sm:w-auto" onClick={() => recordHistory({ scrubAssessment: true, view: "question", questionKey: question.key })}>{t("assessment.actions.continue")}<ArrowRight className="h-4 w-4"/></button>
      </div>
    </AssessmentShell>
  );

  const answer = progress.answers[question.key];
  return (
    <AssessmentShell>
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl min-w-0 flex-col pb-28">
        {restored && <div role="status" className="mb-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">{t("assessment.restored")}<button className="ml-2 underline" onClick={() => setRestored(false)}>{t("assessment.actions.dismiss")}</button></div>}
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-medium text-primary-700">{t(section.titleKey)}</span><span className="text-gray-500">{t("assessment.progress.section", { current: sectionIndex + 1, total: definition!.sections.length })}</span></div>
          <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${definition!.sections.length}, minmax(0, 1fr))` }} aria-hidden="true">{definition!.sections.map((item, itemIndex) => <span key={item.key} className={`h-1.5 rounded-full ${itemIndex <= sectionIndex ? "bg-primary-600" : "bg-gray-200"}`} />)}</div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-500">{t("assessment.progress.question", { current: sectionQuestionIndex + 1, total: sectionQuestions.length })}</p><div className="flex gap-3"><button type="button" className="min-h-11 text-xs font-medium text-gray-600 underline" onClick={() => window.location.assign("/")}>{t("assessment.actions.pause")}</button><button type="button" className="min-h-11 text-xs font-medium text-gray-600 underline" onClick={startOver}>{t("assessment.actions.startOver")}</button></div></div>
        </div>
        <main className="min-w-0 flex-1 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-gray-500">{question.required ? t("assessment.required") : t("assessment.optional")}</p>
          <h1 id="assessment-question-heading" ref={headingRef} tabIndex={-1} className="mt-2 break-words text-2xl font-bold leading-tight text-gray-900 outline-none sm:text-3xl">{t(question.promptKey)}</h1>
          {question.helpKey && <p className="mt-3 text-sm leading-6 text-gray-600">{t(question.helpKey)}</p>}
          {clarityHelperKey && <p id="assessment-choice-guidance" className="mt-3 text-sm font-medium leading-6 text-primary-800">{t(clarityHelperKey)}</p>}
          <fieldset className="mt-6 space-y-3" aria-labelledby="assessment-question-heading" aria-describedby={[clarityHelperKey && "assessment-choice-guidance", error && "assessment-question-error"].filter(Boolean).join(" ") || undefined}>
            <legend className="sr-only">{t(question.promptKey)}</legend>
            {question.kind !== "text" && question.options?.map((item) => {
              const checked = Array.isArray(answer) ? answer.includes(item.value) : answer === item.value;
              return <label key={item.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary-500 ${checked ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-gray-300"}`}><input type={question.kind === "multi" ? "checkbox" : "radio"} name={question.key} value={item.value} checked={checked} onChange={() => question.kind === "multi" ? choose(checked ? (answer as string[]).filter((value) => value !== item.value) : [...(Array.isArray(answer) ? answer : []), item.value]) : choose(item.value)} className="h-5 w-5 flex-none accent-primary-600"/><span className="min-w-0 break-words text-sm font-medium text-gray-800 sm:text-base">{t(item.labelKey)}</span></label>;
            })}
            {question.kind === "text" && <><textarea value={typeof answer === "string" ? answer : ""} maxLength={question.maxLength} rows={7} onChange={(event) => choose(event.target.value)} className="input-field min-h-40 resize-y" aria-invalid={Boolean(error)} aria-describedby={`${question.key}-privacy ${question.key}-count${error ? " assessment-question-error" : ""}`} /><p id={`${question.key}-privacy`} className="text-sm text-gray-500">{t("assessment.qualitativePrivacy")}</p><p id={`${question.key}-count`} className="text-right text-xs text-gray-400">{t("assessment.characterCount", { current: typeof answer === "string" ? answer.length : 0, max: question.maxLength })}</p></>}
          </fieldset>
          {error && <p id="assessment-question-error" role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </main>
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500"><ShieldCheck className="h-4 w-4"/>{t("assessment.localSave")}</p>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3"><button type="button" className="btn-secondary flex-1 gap-2" onClick={goBack} disabled={busy}><ArrowLeft className="h-4 w-4"/>{t("common.back")}</button><button type="button" className="btn-primary flex-[1.4] gap-2" onClick={goNext} disabled={busy}>{index === questions.length - 1 ? t("assessment.actions.complete") : t("common.next")}<ArrowRight className="h-4 w-4"/></button></div>
        </div>
      </div>
    </AssessmentShell>
  );
}

function AssessmentShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="min-h-dvh min-w-0 overflow-x-hidden bg-gray-50"><header className="border-b border-gray-200 bg-white"><div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"><a href="/" className="flex min-h-11 items-center gap-2"><img src="/logo-icon.png" alt="" className="h-8 w-8"/><span className="font-bold text-gray-900">SCRUB</span><span className="hidden text-sm text-gray-500 sm:inline">{t("assessment.headerLabel")}</span></a><LanguageSwitcher/></div></header><div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6 sm:py-10">{children}</div></div>;
}
