import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConceptPicker, JobStatus, StyleFields } from "../apps/web/src/App";
import {
  boardSchema,
  defaultStyle,
  normalizeScenes,
  setSceneDuration,
  productSchema,
  type Preset,
  type Scene,
} from "../packages/shared-schema";
import { sceneVisual } from "../apps/renderer/src/Video";
import cute from "../packages/concept-presets/cute_stationery.json";
import minimal from "../packages/concept-presets/minimal.json";
import contractFixture from "./fixtures/board.json";
const preset = cute as Preset;
const scene: Scene = {
  id: "s1",
  assetId: "a1",
  startFrame: 0,
  durationFrames: 150,
  layout: "blur_contain",
  fit: "contain",
  focalPoint: { x: 0.5, y: 0.5 },
  motion: { type: "zoom_in", strength: 0.08 },
  transitionIn: "fade",
  transitionOut: "fade",
  caption: "상품 소개",
  captionEmphasis: [],
  voiceover: "상품입니다",
};
describe("Product input", () => {
  it("rejects missing name, negative and noninteger price", () => {
    const data = {
      name: "노트",
      price: 3500,
      brand: "",
      features: "",
      audience: "",
      cta: "만나보세요",
      duration: 15,
      conceptId: preset.id,
      style: defaultStyle,
    };
    expect(productSchema.safeParse(data).success).toBe(true);
    for (const patch of [
      { name: "" },
      { price: -1 },
      { price: 1.2 },
      { duration: 16 },
    ])
      expect(productSchema.safeParse({ ...data, ...patch }).success).toBe(
        false,
      );
  });
  it("selects and filters concepts", () => {
    const select = vi.fn();
    render(
      <ConceptPicker
        presets={[preset, minimal as Preset]}
        value={preset.id}
        onChange={select}
      />,
    );
    fireEvent.change(screen.getByLabelText("컨셉 검색"), {
      target: { value: "미니멀" },
    });
    expect(screen.queryByText("귀여운 문구점")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /미니멀 제품 광고/ }));
    expect(select).toHaveBeenCalledWith(minimal);
  });
  it("edits price display and variants", () => {
    const update = vi.fn();
    render(<StyleFields value={defaultStyle} onChange={update} />);
    fireEvent.change(screen.getByLabelText("가격 표시"), {
      target: { value: "always" },
    });
    expect(update).toHaveBeenCalledWith({
      ...defaultStyle,
      priceDisplay: "always",
    });
    fireEvent.change(screen.getByLabelText("생성 개수"), {
      target: { value: "4" },
    });
    expect(update).toHaveBeenCalledWith({ ...defaultStyle, variants: 4 });
  });
});
describe("Storyboard contract and rendering", () => {
  it("keeps the selected scene length while redistributing the other scenes", () => {
    const result = setSceneDuration(
      [scene, { ...scene, id: "b" }, { ...scene, id: "c" }],
      1,
      240,
      15,
    );
    expect(result[1].durationFrames).toBe(240);
    expect(result.reduce((n, s) => n + s.durationFrames, 0)).toBe(450);
  });
  it("accepts the same versioned contract as Pydantic", () => {
    expect(boardSchema.safeParse(contractFixture).success).toBe(true);
  });
  it("keeps the timeline contiguous and stable after editing", () => {
    const result = normalizeScenes(
      [
        scene,
        { ...scene, id: "s2", durationFrames: 100 },
        { ...scene, id: "s3", durationFrames: 450 },
      ],
      15,
    );
    expect(result.reduce((sum, s) => sum + s.durationFrames, 0)).toBe(450);
    expect(result[1].startFrame).toBe(result[0].durationFrames);
    expect(normalizeScenes(result, 15)).toEqual(result);
  });
  it("validates structured data and rejects unknown motion", () => {
    const data = {
      version: 1,
      durationSec: 15,
      fps: 30,
      conceptId: preset.id,
      hook: "첫 문구",
      hookCandidates: ["하나", "둘", "셋"],
      scenes: [scene, { ...scene, id: "s2" }],
      outro: { productName: "노트", priceText: "3,500원", cta: "만나보세요" },
      style: defaultStyle,
    };
    expect(boardSchema.safeParse(data).success).toBe(true);
    expect(
      boardSchema.safeParse({
        ...data,
        scenes: [
          { ...scene, motion: { type: "invented", strength: 5 } },
          scene,
        ],
      }).success,
    ).toBe(false);
  });
  it("uses deterministic but distinct concept frames", () => {
    const first = sceneVisual(scene, 45, preset);
    expect(first).toEqual(sceneVisual(scene, 45, preset));
    expect(first.background).not.toBe(
      sceneVisual(scene, 45, minimal as Preset).background,
    );
    expect(first.scale).toBeGreaterThan(1);
  });
  it("shows rendering stage, progress, and cancel control", () => {
    const cancel = vi.fn();
    render(
      <JobStatus
        job={{
          id: "j",
          kind: "render",
          status: "rendering",
          progress: 42,
          attempt: 1,
          error: null,
          error_code: null,
          created_at: "",
        }}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "42");
    expect(screen.getAllByText("영상 렌더링").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
