import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const preset = JSON.parse(
  readFileSync("packages/concept-presets/review.json", "utf8"),
);
const fixture = JSON.parse(readFileSync("tests/fixtures/board.json", "utf8"));

test("전체 사진 자동 제작 안내와 진행 상태", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const photos = [1, 2, 3].map((i) => ({
    id: `photo-${i}`,
    kind: "image",
    filename: `노트-${i}.jpg`,
    url: `/api/photo-${i}.jpg`,
    width: 1200,
    height: 1500,
    position: i,
    primary: i === 1,
  }));
  const project = {
    id: "auto-demo",
    name: "오늘의 문구 리뷰",
    info: {
      name: "오늘의 문구 리뷰",
      price: 3500,
      brand: "",
      features: "격자 내지",
      audience: "문구 취향",
      cta: "마음에 들면 저장해요",
      duration: 15,
      conceptId: "review",
      style: fixture.style,
    },
    assets: photos,
    board: null,
    revision: 0,
    analysis: null,
    status: "draft",
    jobs: [] as unknown[],
    outputs: [],
    created_at: "",
    updated_at: "",
  };
  let submissions = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (/photo-\d.jpg$/.test(path)) {
      await route.fulfill({
        contentType: "image/jpeg",
        body: readFileSync("samples/notebook-1.jpg"),
      });
      return;
    }
    if (path.endsWith("/health"))
      data = {
        app: "paper-studio",
        video: { enabled: true },
        ai: "demo",
        tts: true,
      };
    else if (path.endsWith("/presets")) data = [preset];
    else if (path.endsWith("/auto-video/plan"))
      data = {
        photos: photos.map((p, i) => ({
          ...p,
          assetId: p.id,
          status: i === 0 ? "completed" : "pending",
        })),
      };
    else if (path.endsWith("/auto-video")) {
      submissions++;
      expect(route.request().postDataJSON()).toEqual({
        revision: 0,
        narration: false,
        useCurrentEdit: false,
      });
      data = {
        id: "batch",
        kind: "auto_video",
        status: "images",
        phase: "clips",
        progress: 35,
        attempt: 1,
        photos: photos.map((p, i) => ({
          assetId: p.id,
          filename: p.filename,
          status: i === 0 ? "completed" : i === 1 ? "processing" : "pending",
        })),
      };
      project.jobs = [data];
      project.status = "images";
    } else if (path.endsWith("/projects/auto-demo")) data = project;
    await route.fulfill({ json: data });
  });
  await page.goto("/#studio/auto-demo");
  const panel = page.locator(".auto-video-panel");
  await expect(
    panel.getByRole("heading", { name: "사진만 고르면, 편집까지 한 번에" }),
  ).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByText(/새로 생성 2개/)).toBeVisible();
  await panel.screenshot({ path: "test-results/auto-video-panel.png" });
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "전체 사진으로 숏츠 완성하기 (유료)" })
    .click();
  await expect(page.getByText(/영상 준비 1 \/ 3장/)).toBeVisible();
  await expect(page.getByText("생성 중", { exact: true })).toBeVisible();
  await page
    .locator(".job-panel")
    .screenshot({ path: "test-results/auto-video-progress.png" });
  expect(submissions).toBe(1);
  expect(errors).toEqual([]);
});
