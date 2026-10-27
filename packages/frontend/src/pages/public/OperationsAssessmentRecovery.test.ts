// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance, type i18n } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { INITIAL_ASSESSMENT_DEFINITION } from "../../../../../convex/lib/assessmentDefinition";
import { ASSESSMENT_PROGRESS_KEY } from "../../lib/assessmentPersistence";

const mutations = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>());
vi.mock("convex/react", () => ({ useMutation: (ref: any) => mutations.get(getFunctionName(ref)) }));
vi.mock("@/lib/assessmentPersistence", () => import("../../lib/assessmentPersistence"));
vi.mock("@/components/shared/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("./OperationsAssessmentReport", () => ({ OperationsAssessmentReport: () => createElement("p", { "data-testid": "report" }, "Report ready") }));
import { OperationsAssessmentPage } from "./OperationsAssessmentPage";

const definition = {
  ...INITIAL_ASSESSMENT_DEFINITION, _id: "definition",
  sections: INITIAL_ASSESSMENT_DEFINITION.sections.slice(0, 1),
  questions: INITIAL_ASSESSMENT_DEFINITION.questions.filter((q) => q.key === "business.team_size"),
};
const report = { payload: { reportVersion: 1 } };
const roadmap = { payload: { roadmapVersion: 1 } };
const saved = { attemptId: "attempt", capability: "a".repeat(64), answers: { "business.team_size": "solo" }, language: "en", lastActivityAt: 1 };
const recovered = (status = "completed", language = "en", snapshots = true) => ({
  definition, responses: [{ questionKey: "business.team_size", responseKind: "single", answerValue: "solo" }],
  attempt: { status, responseLanguage: language, lastActivityAt: 1,
    completionSnapshot: status === "completed" ? {} : undefined,
    reportSnapshot: snapshots ? report : undefined, roadmapSnapshot: snapshots ? roadmap : undefined },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const call = (name: string) => mutations.get(name)!;
let root: Root;
let host: HTMLDivElement;
let language: i18n;
const tree = () => createElement(StrictMode, null, createElement(I18nextProvider, { i18n: language }, createElement(OperationsAssessmentPage)));
async function mount() { await act(async () => { root.render(tree()); }); }
async function idle() { await act(async () => { await new Promise((done) => setTimeout(done, 30)); }); }
async function click(text: string, twice = false) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  expect(button, `button containing ${text}`).toBeTruthy();
  await act(async () => { button!.click(); if (twice) button!.click(); });
}

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/assessment");
  localStorage.clear();
  localStorage.setItem(ASSESSMENT_PROGRESS_KEY, JSON.stringify(saved));
  mutations.clear();
  for (const name of ["prepare", "start", "recover", "attributeGiveaway", "saveResponse", "complete", "generateReport", "generateRoadmap", "abandon"]) mutations.set(`assessments:${name}`, vi.fn().mockResolvedValue({}));
  for (const name of ["recordEvent", "openReturnLink"]) mutations.set(`assessmentContinuity:${name}`, vi.fn().mockResolvedValue({}));
  call("assessments:prepare").mockResolvedValue(definition);
  call("assessments:recover").mockResolvedValue(recovered());
  call("assessments:start").mockResolvedValue({ attemptId: "new-attempt" });
  call("assessments:generateReport").mockResolvedValue(report);
  call("assessments:generateRoadmap").mockResolvedValue(roadmap);
  language = createInstance();
  await language.use(initReactI18next).init({ lng: "en", defaultNS: "common", resources: { en: { common: en }, es: { common: es } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("assessment initialization with real React effects and translation events", () => {
  it("recovers completed snapshots once under Strict Mode and stays idle across renders and language events", async () => {
    const change = vi.spyOn(language, "changeLanguage");
    await mount();
    expect(host.querySelector('[data-testid="report"]')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    for (let index = 0; index < 4; index++) {
      await mount();
      await act(async () => { await language.changeLanguage(index % 2 ? "es" : "en"); });
    }
    await idle();
    expect(call("assessments:prepare")).toHaveBeenCalledTimes(1);
    expect(call("assessments:recover")).toHaveBeenCalledTimes(1);
    expect(call("assessmentContinuity:recordEvent")).toHaveBeenCalledTimes(1);
    expect(call("assessments:generateReport")).not.toHaveBeenCalled();
    expect(call("assessments:generateRoadmap")).not.toHaveBeenCalled();
  });

  it("restores an in-progress assessment and synchronizes an actual language difference once", async () => {
    call("assessments:recover").mockResolvedValue(recovered("in_progress", "es", false));
    const change = vi.spyOn(language, "changeLanguage");
    await mount(); await idle();
    expect(change).toHaveBeenCalledTimes(1);
    expect(language.resolvedLanguage).toBe("es");
    expect(host.querySelector('input[value="solo"]:checked')).toBeTruthy();
    expect(call("assessments:recover")).toHaveBeenCalledTimes(1);
    expect(call("assessments:generateReport")).not.toHaveBeenCalled();
  });

  it("generates only missing snapshots on completed recovery", async () => {
    const result = recovered(); delete (result.attempt as any).roadmapSnapshot;
    call("assessments:recover").mockResolvedValue(result);
    await mount(); await idle();
    expect(call("assessments:generateReport")).not.toHaveBeenCalled();
    expect(call("assessments:generateRoadmap")).toHaveBeenCalledTimes(1);
  });

  it("uses the current language when the user switches while recovery is pending", async () => {
    const pending = deferred<any>(); call("assessments:recover").mockReturnValue(pending.promise);
    const change = vi.spyOn(language, "changeLanguage");
    await mount();
    await act(async () => { await language.changeLanguage("es"); });
    await act(async () => pending.resolve(recovered("completed", "es")));
    expect(change).toHaveBeenCalledTimes(1);
    expect(call("assessments:recover")).toHaveBeenCalledTimes(1);
  });

  it("generates both snapshots once when neither exists", async () => {
    call("assessments:recover").mockResolvedValue(recovered("completed", "en", false));
    await mount(); await idle();
    expect(call("assessments:generateReport")).toHaveBeenCalledTimes(1);
    expect(call("assessments:generateRoadmap")).toHaveBeenCalledTimes(1);
  });

  it("shares pending initialization across rerenders and prevents completion before recovery settles", async () => {
    const pending = deferred<any>(); call("assessments:recover").mockReturnValue(pending.promise);
    await mount(); await mount();
    await click(en.assessment.actions.continueAssessment);
    await click(en.assessment.actions.continue);
    await click(en.assessment.actions.complete, true);
    expect(call("assessments:complete")).not.toHaveBeenCalled();
    await act(async () => pending.resolve(recovered()));
    expect(call("assessments:recover")).toHaveBeenCalledTimes(1);
  });

  it.each(["prepare", "recover", "generateReport", "generateRoadmap"])("stops initialization after unmount during %s", async (stage) => {
    call("assessments:recover").mockResolvedValue(recovered("completed", "en", false));
    const pending = deferred<any>(); call(`assessments:${stage}`).mockReturnValue(pending.promise);
    await mount();
    const before = [...mutations.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    await act(async () => root.unmount());
    const value = stage === "prepare" ? definition : stage === "recover" ? recovered() : stage === "generateReport" ? report : roadmap;
    await act(async () => pending.resolve(value));
    expect([...mutations.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(before);
    // afterEach can safely unmount an already unmounted root.
  });

  it("recovers return links once, including a real language change", async () => {
    window.history.replaceState(null, "", "/assessment?return=token");
    call("assessmentContinuity:openReturnLink").mockResolvedValue({ report: report.payload, roadmap: roadmap.payload, language: "es" });
    await mount(); await mount(); await idle();
    expect(language.resolvedLanguage).toBe("es");
    expect(host.querySelector('[data-testid="report"]')).toBeTruthy();
    expect(call("assessmentContinuity:openReturnLink")).toHaveBeenCalledTimes(1);
    expect(call("assessments:prepare")).not.toHaveBeenCalled();
  });

  it("does not continue return-link recovery after unmount", async () => {
    window.history.replaceState(null, "", "/assessment?return=token");
    const pending = deferred<any>(); call("assessmentContinuity:openReturnLink").mockReturnValue(pending.promise);
    await mount(); await act(async () => root.unmount());
    await act(async () => pending.resolve({ report: report.payload, roadmap: roadmap.payload, language: "es" }));
    expect(language.resolvedLanguage).toBe("en");
  });

  it("coalesces double completion through the entire pipeline", async () => {
    call("assessments:recover").mockResolvedValue(recovered("in_progress", "en", false));
    const pending = deferred<any>(); call("assessments:complete").mockReturnValue(pending.promise);
    await mount(); await click(en.assessment.actions.complete, true);
    expect(call("assessments:saveResponse")).toHaveBeenCalledTimes(1);
    expect(call("assessments:complete")).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({})); await idle();
    expect(call("assessments:generateReport")).toHaveBeenCalledTimes(1);
    expect(call("assessments:generateRoadmap")).toHaveBeenCalledTimes(1);
  });

  it("creates and completes a fresh assessment normally", async () => {
    localStorage.clear(); await mount();
    await click(en.assessment.actions.begin); await click(en.assessment.actions.continue);
    await act(async () => host.querySelector<HTMLInputElement>('input[value="solo"]')!.click());
    await click(en.assessment.actions.complete); await idle();
    expect(call("assessments:start")).toHaveBeenCalledTimes(1);
    expect(call("assessments:complete")).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="report"]')).toBeTruthy();
  });

  it.each(["complete", "generateReport", "generateRoadmap"])("stops completion after unmount during %s", async (stage) => {
    call("assessments:recover").mockResolvedValue(recovered("in_progress", "en", false));
    const pending = deferred<any>(); call(`assessments:${stage}`).mockReturnValue(pending.promise);
    await mount(); await click(en.assessment.actions.complete);
    const before = [...mutations.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    await act(async () => root.unmount());
    await act(async () => pending.resolve(stage === "generateReport" ? report : stage === "generateRoadmap" ? roadmap : {}));
    expect([...mutations.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(before);
  });

  it("retains saved progress on throttling and does not retry automatically", async () => {
    call("assessments:recover").mockRejectedValue(new Error("Assessment recovery rate limit exceeded"));
    await mount(); await mount(); await idle();
    expect(JSON.parse(localStorage.getItem(ASSESSMENT_PROGRESS_KEY)!).attemptId).toBe(saved.attemptId);
    expect(call("assessments:recover")).toHaveBeenCalledTimes(1);
    expect(call("assessments:generateReport")).not.toHaveBeenCalled();
  });
});
