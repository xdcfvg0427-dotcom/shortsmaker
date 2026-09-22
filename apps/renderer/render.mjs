import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  renderStill,
  makeCancelSignal,
  openBrowser,
} from "@remotion/renderer";
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const { inputProps, outputDir, browserExecutable, concurrency } = manifest;
const progress = (value) => {
  const target = path.join(outputDir, "progress.json");
  fs.writeFileSync(target, JSON.stringify({ progress: value }));
};
const { cancelSignal, cancel } = makeCancelSignal();
let cancellationRequested = false;
let browser = null;
function checkCancellation() {
  if (cancellationRequested || fs.existsSync(path.join(outputDir, "cancel")))
    throw new Error("Render cancelled");
}
const timer = setInterval(() => {
  if (fs.existsSync(path.join(outputDir, "cancel"))) {
    cancellationRequested = true;
    cancel();
  }
}, 400);
try {
  const serveUrl = await bundle({
    enableCaching: !process.env.DESKTOP_TOKEN,
    entryPoint: path.resolve("apps/renderer/src/index.tsx"),
    outDir: path.join(outputDir, "bundle"),
    ...(fs.existsSync(path.join(outputDir, "media"))
      ? { publicDir: path.join(outputDir, "media") }
      : {}),
  });
  checkCancellation();
  browser = await openBrowser("chrome", {
    browserExecutable: browserExecutable || undefined,
    logLevel: "error",
  });
  checkCancellation();
  const options = {
    serveUrl,
    inputProps,
    browserExecutable: browserExecutable || undefined,
    chromiumOptions: { disableWebSecurity: false },
    logLevel: "error",
    puppeteerInstance: browser,
  };
  const composition = await selectComposition({ ...options, id: "PaperShort" });
  checkCancellation();
  if (manifest.stillOnly) {
    await renderStill({
      ...options,
      composition,
      frame: 45,
      output: path.join(outputDir, "thumbnail.png"),
      imageFormat: "png",
      scale: 0.35,
    });
  } else {
    await renderMedia({
      ...options,
      composition,
      codec: "h264",
      crf: 21,
      pixelFormat: "yuv420p",
      outputLocation: path.join(outputDir, "silent.mp4"),
      concurrency: concurrency || 2,
      cancelSignal,
      onProgress: (p) => progress(Math.round(p.progress * 100)),
    });
    await renderStill({
      ...options,
      composition,
      frame: 45,
      output: path.join(outputDir, "thumbnail.png"),
      imageFormat: "png",
    });
  }
  progress(100);
} catch (e) {
  fs.writeFileSync(
    path.join(outputDir, "renderer-error.txt"),
    String(e?.message || "Render failed"),
  );
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  if (browser) {
    // Ask the browser we created to exit through DevTools, avoiding OS-wide process scans.
    await browser.connection.send("Browser.close").catch(() => {});
    browser.disconnect();
  }
}
