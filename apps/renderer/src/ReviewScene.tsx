import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Loop,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Scene } from "../../../packages/shared-schema";
import type { VideoProps } from "./Video";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function ReviewScene({
  scene,
  index,
  board,
  preset,
  assets,
  videos,
  storeName,
  storeUrl,
  brand,
  logo,
}: VideoProps & { scene: Scene; index: number }) {
  const frame = useCurrentFrame();
  const end = scene.layout === "endcard";
  const first = index === 0;
  const asset = assets[scene.assetId];
  const clip = scene.videoAssetId ? videos?.[scene.videoAssetId] : undefined;
  const t = interpolate(
    frame,
    [0, Math.max(1, scene.durationFrames - 1)],
    [0, 1],
    clamp,
  );
  const enter = interpolate(
    frame,
    [0, board.style.pace === "slow" ? 16 : 7],
    [0, 1],
    clamp,
  );
  const scale =
    scene.motion.type === "zoom_in"
      ? 1 + t * scene.motion.strength
      : scene.motion.type === "zoom_out"
        ? 1 + (1 - t) * scene.motion.strength
        : 1;
  const pan =
    scene.motion.type === "pan_left"
      ? -t * 60
      : scene.motion.type === "pan_right"
        ? t * 60
        : 0;
  const price =
    board.style.priceDisplay === "always" ||
    (board.style.priceDisplay === "last" && end) ||
    (board.style.priceDisplay === "middle" &&
      index === Math.floor(board.scenes.length / 2));
  const ink = preset.palette[0];
  const lime = preset.palette[2];
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: scene.fit,
    objectPosition: `${scene.focalPoint.x * 100}% ${scene.focalPoint.y * 100}%`,
    transform: `translateX(${pan}px) scale(${scale})`,
  };
  const label = first
    ? "오늘의 발견"
    : end
      ? "위시리스트에 저장"
      : "취향 디테일";
  return (
    <AbsoluteFill
      style={{
        background: preset.palette[1],
        color: ink,
        fontFamily: '"Noto Sans KR", sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 150,
          top: 115,
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontSize: 24,
        }}
      >
        {logo && (
          <Img
            src={logo}
            style={{ width: 100, height: 48, objectFit: "contain" }}
          />
        )}
        <span style={{ flex: 1, overflowWrap: "anywhere" }}>
          {storeName || brand || "STATIONERY / FINDS"}
        </span>
        {storeName && (
          <span style={{ fontSize: 21, flexShrink: 0 }}>상품 광고</span>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: 225,
          left: 72,
          right: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            background: lime,
            padding: "12px 24px",
            borderRadius: 50,
            fontSize: 25,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 24, letterSpacing: 3 }}>
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(board.scenes.length).padStart(2, "0")}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 335,
          left: 72,
          right: 150,
          fontSize: first ? 76 : 56,
          fontWeight: 700,
          letterSpacing: -3,
          lineHeight: 1.18,
        }}
      >
        {first ? (
          <>
            작은 문구,
            <br />
            확실한 내 취향.
          </>
        ) : end ? (
          <>
            내 책상에도
            <br />
            이런 포인트.
          </>
        ) : (
          <>
            조금 더 가까이,
            <br />
            디테일 체크.
          </>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 150,
          top: 570,
          height: end ? 640 : 760,
          background: "#FFFFFF",
          borderRadius: 32,
          overflow: "hidden",
          boxShadow: "0 18px 55px #28252612",
          transform:
            scene.transitionIn === "pop"
              ? `scale(${0.94 + enter * 0.06})`
              : scene.transitionIn === "slide"
                ? `translateX(${(1 - enter) * 90}px)`
                : "none",
        }}
      >
        {clip ? (
          <Loop durationInFrames={150} layout="none">
            <OffthreadVideo
              muted
              src={
                clip.src.startsWith("clips/") ? staticFile(clip.src) : clip.src
              }
              style={mediaStyle}
            />
          </Loop>
        ) : asset ? (
          <Img src={asset.src} style={mediaStyle} />
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 24,
            bottom: 24,
            padding: "10px 18px",
            background: "#FFFFFFED",
            borderRadius: 10,
            fontSize: 20,
            letterSpacing: 2,
          }}
        >
          THE LITTLE THINGS
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: end ? 1150 : 1265,
          right: 155,
          background: lime,
          padding: "16px 28px",
          border: `2px solid ${ink}`,
          borderRadius: 12,
          fontSize: 27,
          fontWeight: 700,
          transform: `rotate(-6deg) scale(${0.9 + enter * 0.1})`,
        }}
      >
        {end ? "SAVE FOR LATER ↗" : "취향 수집 중 ↗"}
      </div>
      <div
        style={{
          position: "absolute",
          top: end ? 1240 : 1400,
          left: 72,
          right: 150,
          transform: `translateY(${(1 - enter) * 24}px)`,
        }}
      >
        {end && (
          <div
            style={{
              fontSize: board.outro.productName.length > 40 ? 26 : 34,
              fontWeight: 700,
              marginBottom: 20,
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {board.outro.productName}
          </div>
        )}
        <div
          style={{
            fontSize:
              scene.caption.length > 80
                ? 28
                : scene.caption.length > 55
                  ? 34
                  : scene.caption.length > 28
                    ? 43
                    : 56,
            fontWeight: board.style.captionStyle === "clean" ? 400 : 700,
            lineHeight: 1.4,
            letterSpacing: -1.5,
            overflowWrap: "anywhere",
          }}
        >
          <span
            style={{
              background: ink,
              color: "white",
              padding: "4px 14px",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {scene.caption}
          </span>
        </div>
        {price && (
          <div style={{ marginTop: 22, fontSize: 38, fontWeight: 700 }}>
            {board.outro.priceText}
          </div>
        )}
        {end && storeUrl && (
          <div
            style={{
              marginTop: 18,
              fontSize:
                storeUrl.length > 120 ? 14 : storeUrl.length > 70 ? 18 : 24,
              lineHeight: 1.3,
              overflowWrap: "anywhere",
            }}
          >
            {storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 180,
          left: 72,
          right: 150,
          display: "flex",
          gap: 10,
        }}
      >
        {board.scenes.map((item, i) => (
          <div
            key={item.id}
            style={{
              height: 5,
              flex: 1,
              background: `${ink}20`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: ink,
                width: `${i < index ? 100 : i === index ? t * 100 : 0}%`,
              }}
            />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
