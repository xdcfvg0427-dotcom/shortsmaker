import React from "react";
import type { Preset } from "../../../packages/shared-schema";

export function PresetFields({
  text,
  onChange,
  disabled,
}: {
  text: string;
  onChange: (text: string) => void;
  disabled: boolean;
}) {
  let p: Preset;
  try {
    p = JSON.parse(text);
    if (!Array.isArray(p.palette)) return null;
  } catch {
    return null;
  }
  const patch = (value: Partial<Preset>) =>
    onChange(JSON.stringify({ ...p, ...value }, null, 2));
  return (
    <fieldset
      disabled={disabled}
      className="form-grid"
      style={{ marginBottom: 24 }}
    >
      <label>
        컨셉 이름
        <input
          value={p.name}
          maxLength={80}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <label>
        마케팅 목적
        <select
          value={p.marketingGoal}
          onChange={(e) => patch({ marketingGoal: e.target.value })}
        >
          {Object.entries({
            sales: "판매",
            awareness: "인지도",
            information: "정보",
            emotion: "감성",
            fun: "재미",
            engagement: "관심",
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="full">
        컨셉 설명
        <textarea
          value={p.description}
          maxLength={300}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </label>
      <label>
        글자 느낌
        <select
          value={p.fontStyle}
          onChange={(e) =>
            patch({ fontStyle: e.target.value as Preset["fontStyle"] })
          }
        >
          {Object.entries({
            clean: "깔끔한 고딕",
            bold: "굵은 강조",
            rounded: "둥근 귀여움",
            handwritten: "손글씨 느낌",
            magazine: "잡지형",
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        속도
        <select
          value={p.pace}
          onChange={(e) => patch({ pace: e.target.value as Preset["pace"] })}
        >
          <option value="slow">느긋하게</option>
          <option value="normal">보통</option>
          <option value="fast">빠르게</option>
        </select>
      </label>
      <label>
        자막 배경
        <select
          value={p.captionStyle}
          onChange={(e) => patch({ captionStyle: e.target.value })}
        >
          <option value="bubble">말풍선</option>
          <option value="minimal">미니멀</option>
          <option value="banner">강조 배너</option>
          <option value="editorial">잡지형</option>
        </select>
      </label>
      <label>
        시즌 태그 (쉼표 구분)
        <input
          value={p.seasonTags.join(",")}
          onChange={(e) => patch({ seasonTags: e.target.value.split(",") })}
        />
      </label>
      <div className="full form-grid">
        {p.palette.map((color, i) => (
          <label key={i}>
            팔레트 {i + 1}
            <input
              type="color"
              value={color}
              onChange={(e) =>
                patch({
                  palette: p.palette.map((c, n) =>
                    n === i ? e.target.value : c,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="full">
        첫 장면 문구 후보 (한 줄에 하나)
        <textarea
          rows={3}
          value={p.hookPatterns.join("\n")}
          onChange={(e) => patch({ hookPatterns: e.target.value.split("\n") })}
        />
      </label>
      <label className="full">
        마지막 문구
        <input
          value={p.outroPattern}
          maxLength={100}
          onChange={(e) => patch({ outroPattern: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
