// Requires the isolated server created for scripts/verify_video.py on port 8013.
// Generation and saves are intercepted in the browser; no paid requests are sent.
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
const base = "http://127.0.0.1:8013";
const projects = await (await fetch(`${base}/api/projects`)).json();
const project = await (
  await fetch(`${base}/api/projects/${projects[0].id}`)
).json();
project.jobs = [];
project.status = "ready";
const clipId = project.board.scenes[0].videoAssetId;
let enabled = false;
let submitted = false;
let savedPrompt = "";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        mode: "demo",
        provider: "demo",
        model: "demo",
        tts: true,
        ttsProvider: "runway",
        video: { enabled, model: "gen4_turbo", provider: "runway" },
      },
    }),
  );
  await page.route(`**/api/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  );
  await page.route(
    `**/api/projects/${project.id}/storyboard`,
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(project.revision);
      project.board = body.data;
      project.revision++;
      savedPrompt = project.board.scenes[0].videoPrompt;
      await route.fulfill({
        json: { data: project.board, revision: project.revision },
      });
    },
  );
  await page.route("**/scenes/*/video", async (route) => {
    expect(route.request().postDataJSON().revision).toBe(project.revision);
    expect(savedPrompt).toBe("카메라가 천천히 이동합니다");
    submitted = true;
    project.jobs = [
      { id: "mock-generation", kind: "video", status: "images", progress: 40 },
    ];
    await route.fulfill({ status: 202, json: project.jobs[0] });
  });
  await page.goto(`${base}/#studio/${project.id}`);
  await expect(
    page.getByRole("heading", { name: "사진으로 AI 영상 만들기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "AI 영상 새로 생성 (유료)" }),
  ).toBeDisabled();
  await expect(page.locator(".ai-clip-preview")).toBeVisible();
  await page.locator(".ai-clip-preview").evaluate(async (el) => {
    await el.play();
  });
  await expect
    .poll(() =>
      page.locator(".ai-clip-preview").evaluate((el) => el.currentTime),
    )
    .toBeGreaterThan(0.1);
  enabled = true;
  await page.reload();
  await page.getByRole("button", { name: "음악 + 자막 내레이션 켜기" }).click();
  await expect(page.getByLabel("자동 내레이션", { exact: true })).toHaveValue(
    "caption",
  );
  await expect(page.getByLabel("배경음악 선택")).toHaveValue("lofi");
  await page.getByLabel("장면 자막").fill("바꾼 자막을 자동으로 읽어요");
  await expect(page.getByRole("textbox", { name: /내레이션 원고/ })).toHaveValue(
    "바꾼 자막을 자동으로 읽어요",
  );
  await expect(
    page.getByRole("textbox", { name: /내레이션 원고/ }),
  ).toBeDisabled();
  await expect.poll(() => project.board.style.narrationSource).toBe("caption");
  await page.getByLabel("장면에 사용할 영상").selectOption("");
  await page.getByLabel("원하는 움직임").fill("카메라가 천천히 이동합니다");
  await page.getByRole("button", { name: "AI 영상 생성 (유료)" }).click();
  await expect.poll(() => submitted).toBe(true);
  await expect(page.getByText("AI 영상 생성 · 움직임 생성 중")).toBeVisible();
  project.board.scenes[0].videoAssetId = clipId;
  project.revision++;
  project.jobs[0].status = "completed";
  project.jobs[0].progress = 100;
  await expect(page.getByLabel("장면에 사용할 영상")).toHaveValue(clipId);
  await expect(page.locator(".ai-clip-preview")).toBeVisible();
  await page
    .getByRole("heading", { name: "사진으로 AI 영상 만들기" })
    .scrollIntoViewIfNeeded();
  fs.mkdirSync("storage/video-verification/screenshots", { recursive: true });
  await page.screenshot({
    path: "storage/video-verification/screenshots/editor.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "UI passed: missing key, video playback, save-before-generate, polling, automatic clip selection, tablet layout.",
  );
} finally {
  await browser.close();
}
