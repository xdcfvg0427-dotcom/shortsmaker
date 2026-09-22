import { z } from "zod";
export const motionNames = [
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
  "still",
] as const;
export const transitions = [
  "fade",
  "pop",
  "slide",
  "soft_zoom",
  "none",
] as const;
export const layouts = [
  "full_bleed",
  "blur_contain",
  "split",
  "product_card",
  "features",
  "endcard",
] as const;
export const styleSchema = z
  .object({
    pace: z.enum(["slow", "normal", "fast"]),
    captionStyle: z.enum([
      "clean",
      "bold",
      "rounded",
      "handwritten",
      "magazine",
    ]),
    musicMood: z.enum([
      "none",
      "bright_cute",
      "lofi",
      "trendy",
      "premium",
      "retro",
    ]),
    narration: z.enum(["none", "ai", "script"]),
    narrationSource: z.enum(["caption", "script"]).optional(),
    priceDisplay: z.enum(["hidden", "middle", "last", "always"]),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    volume: z.number().min(0).max(1),
    fadeSec: z.number().min(0).max(5),
    ducking: z.boolean(),
    variants: z.number().int().min(1).max(4),
  })
  .strict();
export const defaultStyle: z.infer<typeof styleSchema> = {
  pace: "normal",
  captionStyle: "rounded",
  musicMood: "none",
  narration: "script",
  narrationSource: "script",
  priceDisplay: "last",
  brandColor: "#496D59",
  volume: 0.25,
  fadeSec: 1,
  ducking: true,
  variants: 1,
};
export const productSchema = z
  .object({
    name: z.string().trim().min(1, "제품명을 입력하세요").max(100),
    price: z.number().int().min(0, "가격은 0원 이상입니다").max(999999999),
    brand: z.string().max(80),
    storeName: z.string().max(80).optional(),
    storeUrl: z
      .string()
      .max(300)
      .regex(/^(https?:\/\/[^\s]+)?$/, "https://로 시작하는 주소를 입력하세요")
      .optional(),
    features: z.string().max(1500),
    audience: z.string().max(200),
    cta: z.string().max(80),
    duration: z.union([z.literal(15), z.literal(20), z.literal(30)]),
    conceptId: z.string().max(80),
    style: styleSchema,
  })
  .strict();
export const sceneSchema = z
  .object({
    id: z.string().min(1).max(60),
    assetId: z.string().min(1).max(40),
    videoAssetId: z.string().min(1).max(40).nullable().optional(),
    videoPrompt: z.string().max(1000).optional(),
    startFrame: z.number().int().min(0),
    durationFrames: z.number().int().min(30).max(900),
    layout: z.enum(layouts),
    fit: z.enum(["contain", "cover"]),
    focalPoint: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict(),
    motion: z
      .object({
        type: z.enum(motionNames),
        strength: z.number().min(0).max(0.12),
      })
      .strict(),
    transitionIn: z.enum(transitions),
    transitionOut: z.enum(transitions),
    caption: z.string().max(120),
    captionEmphasis: z.array(z.string()).max(5),
    voiceover: z.string().max(300),
  })
  .strict();
export const boardSchema = z
  .object({
    version: z.literal(1),
    durationSec: z.union([z.literal(15), z.literal(20), z.literal(30)]),
    fps: z.literal(30),
    conceptId: z.string().max(80),
    hook: z.string().max(120),
    hookCandidates: z.array(z.string()).min(3).max(4),
    scenes: z.array(sceneSchema).min(2).max(12),
    outro: z
      .object({
        productName: z.string().max(100),
        priceText: z.string().max(30),
        cta: z.string().max(80),
      })
      .strict(),
    style: styleSchema,
  })
  .strict();
export type Board = z.infer<typeof boardSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Product = z.infer<typeof productSchema>;
export type Style = z.infer<typeof styleSchema>;
export type Preset = {
  version: 1;
  id: string;
  name: string;
  description: string;
  marketingGoal: string;
  targetAudience: string[];
  palette: string[];
  fontStyle: Style["captionStyle"];
  captionStyle: string;
  pace: Style["pace"];
  transitionSet: Scene["transitionIn"][];
  motionSet: Scene["motion"]["type"][];
  overlaySet: string[];
  musicMood: string;
  copyTone: string;
  hookPatterns: string[];
  outroPattern: string;
  seasonTags: string[];
  builtin?: boolean;
};
export type Asset = {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  position: number;
  primary: boolean;
  url: string;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  error: string | null;
  error_code: string | null;
  attempt: number;
  created_at: string;
};
export const statusNames: Record<string, string> = {
  draft: "작성 중",
  ready: "편집 준비",
  queued: "대기",
  preparing: "준비",
  images: "이미지 처리",
  audio: "음성·오디오 처리",
  rendering: "영상 렌더링",
  verifying: "결과 검증",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
  analyzing: "상품 분석",
  storyboarding: "장면 구성",
};
export const terminal = ["completed", "failed", "cancelled"];
export function normalizeScenes(scenes: Scene[], duration: number): Scene[] {
  const total = duration * 30;
  const sum = scenes.reduce((n, s) => n + s.durationFrames, 0);
  const remaining = total - scenes.length * 30;
  let pos = 0;
  return scenes.map((s, i) => {
    const frames =
      sum === total
        ? s.durationFrames
        : i === scenes.length - 1
          ? total - pos
          : 30 + Math.floor((remaining * s.durationFrames) / sum);
    const result = { ...s, startFrame: pos, durationFrames: frames };
    pos += frames;
    return result;
  });
}

export function setSceneDuration(
  scenes: Scene[],
  index: number,
  requested: number,
  duration: number,
): Scene[] {
  const total = duration * 30;
  const selected = Math.max(
    30,
    Math.min(total - (scenes.length - 1) * 30, requested),
  );
  const others = scenes.filter((_, i) => i !== index);
  const redistributed = normalizeScenes(others, (total - selected) / 30);
  let j = 0;
  return normalizeScenes(
    scenes.map((s, i) =>
      i === index ? { ...s, durationFrames: selected } : redistributed[j++],
    ),
    duration,
  );
}
