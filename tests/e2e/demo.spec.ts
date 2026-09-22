import { test, expect } from "@playwright/test";
test("샘플 → 편집 자동 저장 → 실제 MP4 다운로드", async ({ page, request }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘은 어떤 이야기를 만들까요?" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "샘플로 시작하기" }).click();
  await expect(
    page.getByRole("heading", { name: "데일리 리프 노트" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "스토리보드 만들기", exact: true })
    .click();
  await expect(page.getByLabel("장면 자막")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("장면 자막").fill("나의 기록을 시작하는 노트");
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
  const id = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "1개 영상 렌더링" }).click();
  await expect(page.getByRole("link", { name: "MP4 영상" })).toBeVisible({
    timeout: 1_700_000,
  });
  const project = await (await request.get("/api/projects/" + id)).json();
  expect(project.outputs[0].verification).toMatchObject({
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    fps: 30,
  });
  expect(project.outputs[0].verification.duration).toBeCloseTo(15, 0);
  const video = await request.get(project.outputs[0].downloads.video);
  expect(video.ok()).toBeTruthy();
  expect((await video.body()).length).toBeGreaterThan(50000);
  const captions = await request.get(project.outputs[0].downloads.subtitles);
  expect(await captions.text()).toContain("나의 기록을 시작하는 노트");
  await page.screenshot({ path: "test-results/result.png", fullPage: true });
});
