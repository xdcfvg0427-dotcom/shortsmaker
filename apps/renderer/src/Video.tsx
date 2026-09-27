import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Loop,
  staticFile,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Board, Preset, Scene } from "../../../packages/shared-schema";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/700.css";
import { ReviewScene } from "./ReviewScene";

export type VideoProps = {
  board: Board;
  preset: Preset;
  assets: Record<string, { src: string; width: number; height: number }>;
  videos?: Record<string, { src: string }>;
  logo?: string;
  brand?: string;
  storeName?: string;
  storeUrl?: string;
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export function sceneVisual(scene: Scene, frame: number, preset: Preset) {
  const t = frame / Math.max(1, scene.durationFrames - 1),
    strength = scene.motion.strength;
  const scale =
    scene.motion.type === "zoom_in"
      ? 1 + t * strength
      : scene.motion.type === "zoom_out"
        ? 1 + strength - t * strength
        : 1;
  const x =
    scene.motion.type === "pan_left"
      ? -t * strength * 180
      : scene.motion.type === "pan_right"
        ? t * strength * 180
        : 0;
  return { scale, x, background: preset.palette[1], accent: preset.palette[0] };
}
function SceneView({
  scene,
  board,
  preset,
  assets,
  videos,
  logo,
  brand,
  storeName,
  storeUrl,
  index,
}: VideoProps & { scene: Scene; index: number }) {
  const f = useCurrentFrame();
  const v = sceneVisual(scene, f, preset);
  const a = assets[scene.assetId];
  const clip = scene.videoAssetId ? videos?.[scene.videoAssetId] : undefined;
  const alternate =
    Object.values(assets).find((item) => item.src !== a?.src) || a;
  const enter = interpolate(
      f,
      [
        0,
        board.style.pace === "fast" ? 8 : board.style.pace === "slow" ? 20 : 12,
      ],
      [0, 1],
      clamp,
    ),
    exit = interpolate(
      f,
      [scene.durationFrames - 10, scene.durationFrames],
      [1, 0],
      clamp,
    );
  const isEnd = scene.layout === "endcard";
  const brandedEnd = isEnd && !!storeName;
  const displayUrl = storeUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const font = board.style.captionStyle;
  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: `${scene.focalPoint.x * 100}% ${scene.focalPoint.y * 100}%`,
    transform: `translateX(${v.x}px) scale(${v.scale})`,
    maxWidth: Math.min(860, a?.width * 1.2 || 860),
    maxHeight: Math.min(1180, a?.height * 1.2 || 1180),
  };
  const img = (extra: React.CSSProperties = {}) =>
    clip ? (
      <Loop durationInFrames={150} layout="none">
        <OffthreadVideo
          src={clip.src.startsWith("clips/") ? staticFile(clip.src) : clip.src}
          muted
          style={{
            ...imageStyle,
            ...extra,
            transform: "none",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        />
      </Loop>
    ) : a ? (
      <Img src={a.src} style={{ ...imageStyle, ...extra }} />
    ) : null;
  const showPrice =
    board.style.priceDisplay === "always" ||
    (board.style.priceDisplay === "last" && isEnd) ||
    (board.style.priceDisplay === "middle" &&
      index === Math.floor(board.scenes.length / 2));
  const transitionTransform =
    scene.transitionIn === "slide"
      ? `translateX(${(1 - enter) * 140}px)`
      : scene.transitionIn === "pop"
        ? `scale(${0.88 + enter * 0.12})`
        : scene.transitionIn === "soft_zoom"
          ? `scale(${1.06 - enter * 0.06})`
          : "none";
  return (
    <AbsoluteFill
      style={{
        background: v.background,
        color: "#202822",
        fontFamily: '"Noto Sans KR", sans-serif',
        overflow: "hidden",
      }}
    >
      {scene.layout === "blur_contain" && a && (
        <Img
          src={a.src}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(48px)",
            opacity: 0.18,
            transform: "scale(1.12)",
          }}
        />
      )}
      {preset.overlaySet.includes("grid") && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${v.accent}18 1px,transparent 1px),linear-gradient(90deg,${v.accent}18 1px,transparent 1px)`,
            backgroundSize: "65px 65px",
          }}
        />
      )}
      {preset.overlaySet.includes("grain") && (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(${v.accent}28 1px,transparent 1px)`,
            backgroundSize: "9px 9px",
          }}
        />
      )}
      {storeName && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 80,
            right: 130,
            zIndex: 2,
            background: "#FFFFFFF5",
            borderRadius: 24,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            gap: 22,
            borderBottom: `5px solid ${board.style.brandColor}`,
          }}
        >
          {logo && (
            <Img
              src={logo}
              style={{
                width: 260,
                height: 86,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              color: board.style.brandColor,
              fontWeight: 700,
              fontSize: storeName.length > 14 ? 25 : 42,
              overflowWrap: "anywhere",
              lineHeight: 1.3,
            }}
          >
            {storeName}
          </div>
          <div
            style={{
              flexShrink: 0,
              fontSize: 24,
              color: "#504958",
              border: "1px solid #D5CDD9",
              borderRadius: 100,
              padding: "10px 18px",
            }}
          >
            상품 광고
          </div>
        </div>
      )}
      <AbsoluteFill
        style={{
          opacity:
            (scene.transitionIn === "none" ? 1 : enter) *
            (scene.transitionOut === "none" ? 1 : exit),
          transform: transitionTransform,
        }}
      >
        {!storeName && (
          <div
            style={{
              position: "absolute",
              top: 140,
              left: 80,
              right: 130,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div
              style={{
                fontSize: 26,
                letterSpacing: 4,
                fontWeight: 700,
                color: board.style.brandColor,
                maxWidth: 620,
                overflowWrap: "anywhere",
              }}
            >
              {brand || "PAPER / DAILY FINDS"}
            </div>
            {logo && (
              <Img
                src={logo}
                style={{ width: 110, height: 75, objectFit: "contain" }}
              />
            )}
            {!logo && (
              <div
                style={{
                  border: `2px solid ${v.accent}`,
                  borderRadius: 100,
                  padding: "12px 22px",
                  fontSize: 22,
                  color: v.accent,
                }}
              >
                0{index + 1}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 80,
            right: 130,
            top: 290,
            height: brandedEnd ? 680 : isEnd ? 900 : 1080,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: scene.layout === "product_card" ? 42 : 8,
            background: ["product_card", "endcard", "features"].includes(
              scene.layout,
            )
              ? "#FFFFFFA8"
              : "transparent",
            padding: scene.layout === "product_card" ? 36 : 0,
            boxShadow:
              scene.layout === "product_card"
                ? "0 28px 70px #22332212"
                : undefined,
            overflow: "hidden",
          }}
        >
          {scene.layout === "split" ? (
            <div
              style={{
                display: "grid",
                gridTemplateRows: "1fr 1fr",
                gap: 26,
                width: "100%",
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "#ffffff90",
                  borderRadius: 24,
                }}
              >
                {img({ maxHeight: 510 })}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "#ffffff90",
                  borderRadius: 24,
                }}
              >
                {alternate && (
                  <Img
                    src={alternate.src}
                    style={{ ...imageStyle, maxHeight: 510 }}
                  />
                )}
              </div>
            </div>
          ) : (
            img(
              scene.layout === "full_bleed" && scene.fit === "cover"
                ? { objectFit: "cover", maxHeight: "100%", maxWidth: "100%" }
                : {},
            )
          )}
          {scene.layout === "features" && (
            <div
              style={{
                position: "absolute",
                bottom: 40,
                left: 30,
                right: 30,
                display: "flex",
                gap: 12,
              }}
            >
              {board.scenes
                .filter((s) => s.layout !== "endcard")
                .slice(1, 4)
                .map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      flex: 1,
                      fontSize: 23,
                      background: "#fff",
                      padding: 18,
                      borderRadius: 16,
                      opacity: f > i * 18 ? 1 : 0.25,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <b style={{ color: v.accent }}>0{i + 1}</b>
                    <br />
                    {s.caption.slice(0, 26)}
                  </div>
                ))}
            </div>
          )}
        </div>
        {preset.overlaySet.includes("sparkle") && (
          <div
            style={{
              position: "absolute",
              right: 130,
              top: 320,
              color: v.accent,
              fontSize: 100,
              transform: `rotate(${f * 0.35}deg)`,
            }}
          >
            ✦
          </div>
        )}
        {preset.overlaySet.includes("sticker") && (
          <div
            style={{
              position: "absolute",
              left: 65,
              top: 1150,
              padding: "15px 30px",
              background: preset.palette[2],
              color: v.accent,
              border: `2px solid ${v.accent}`,
              borderRadius: 18,
              fontSize: 25,
              transform: "rotate(-7deg)",
            }}
          >
            TODAY’S PICK
          </div>
        )}
        {brandedEnd && (
          <div
            style={{
              position: "absolute",
              top: 1010,
              left: 80,
              right: 140,
              bottom: 245,
              borderRadius: 36,
              background: "#FFFFFFF5",
              border: `3px solid ${board.style.brandColor}35`,
              padding: "30px 36px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                fontSize: 26,
                color: board.style.brandColor,
                fontWeight: 700,
              }}
            >
              구매 안내 · {storeName}
            </div>
            <div
              style={{
                fontSize: board.outro.productName.length > 40 ? 26 : 32,
                overflowWrap: "anywhere",
                lineHeight: 1.4,
              }}
            >
              {board.outro.productName}
            </div>
            {showPrice && (
              <div
                style={{
                  fontSize: 54,
                  fontWeight: 700,
                  color: board.style.brandColor,
                }}
              >
                {board.outro.priceText}
              </div>
            )}
            <div
              style={{
                fontSize: scene.caption.length > 28 ? 36 : 50,
                fontWeight: 700,
                lineHeight: 1.45,
                overflowWrap: "anywhere",
              }}
            >
              {scene.caption}
            </div>
            {displayUrl && (
              <div
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "20px 12px",
                  borderRadius: 18,
                  background: board.style.brandColor,
                  color: "white",
                  fontSize: displayUrl.length > 45 ? 24 : 32,
                  overflowWrap: "anywhere",
                }}
              >
                {displayUrl}
              </div>
            )}
          </div>
        )}
        {!brandedEnd && (
          <div
            style={{
              position: "absolute",
              left: 80,
              right: 140,
              bottom: showPrice ? 360 : 270,
              textAlign: font === "magazine" ? "left" : "center",
              transform: `translateY(${(1 - enter) * 30}px)`,
            }}
          >
            {isEnd && (
              <div
                style={{
                  fontSize: 35,
                  marginBottom: 25,
                  fontWeight: 700,
                  overflowWrap: "anywhere",
                }}
              >
                {board.outro.productName}
              </div>
            )}
            <div
              style={{
                fontSize:
                  scene.caption.length > 55
                    ? 40
                    : scene.caption.length > 28
                      ? 49
                      : 62,
                lineHeight: 1.5,
                fontWeight: font === "clean" ? 400 : 700,
                letterSpacing: font === "magazine" ? -2 : 0,
                fontStyle: font === "handwritten" ? "italic" : "normal",
                borderRadius: font === "rounded" ? 40 : 8,
                padding: "22px 26px",
                background:
                  preset.captionStyle === "banner" ? v.accent : "#FFFFFFEB",
                color: preset.captionStyle === "banner" ? "white" : "#202822",
                boxShadow: "0 8px 30px #00000008",
                overflowWrap: "anywhere",
              }}
            >
              {scene.caption}
            </div>
          </div>
        )}
        {showPrice && !brandedEnd && (
          <div
            style={{
              position: "absolute",
              bottom: 255,
              left: 80,
              right: 140,
              textAlign: "center",
              fontSize: 60,
              fontWeight: 700,
              color: v.accent,
            }}
          >
            {board.outro.priceText}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            bottom: 195,
            left: 80,
            right: 140,
            height: 5,
            background: "#0000000A",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${((index + f / scene.durationFrames) / board.scenes.length) * 100}%`,
              background: v.accent,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
export function ShortsVideo(props: VideoProps) {
  return (
    <AbsoluteFill>
      {props.board.scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          {props.preset.id === "review" ? (
            <ReviewScene {...props} scene={scene} index={index} />
          ) : (
            <SceneView {...props} scene={scene} index={index} />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
