import React, { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { Asset, Job } from "../../../packages/shared-schema";
import { api, send } from "./api";

export function AutoVideoPanel({
  project,
  disabled,
  run,
  beforeStart,
  onStart,
}: {
  project: { id: string; revision: number; assets: Asset[]; board: unknown };
  disabled: boolean;
  run: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
  beforeStart?: () => Promise<number>;
  onStart: () => void;
}) {
  const [narration, setNarration] = useState(false);
  const availabilityId = useId();
  const photos = project.assets.filter((a) => a.kind === "image");
  const health = useQuery<{ video?: { enabled: boolean } }>({
    queryKey: ["video-health"],
    queryFn: () => api("/health"),
    refetchInterval: 15000,
  });
  const plan = useQuery<{
    photos: NonNullable<Job["photos"]>;
    prompt?: string;
  }>({
    queryKey: [
      "auto-video-plan",
      project.id,
      project.revision,
      photos.map((a) => a.id).join(","),
    ],
    queryFn: () => api(`/projects/${project.id}/auto-video/plan`),
    refetchInterval: disabled ? 1500 : false,
  });
  const completed =
    plan.data?.photos.filter((p) => p.status === "completed").length || 0;
  const resume =
    plan.data?.photos.filter(
      (p) => p.status === "processing" || p.status === "checking",
    ).length || 0;
  const blockedReason = disabled
    ? "진행 중인 작업이나 저장이 끝나면 시작할 수 있어요."
    : !photos.length
      ? "먼저 상품 사진을 한 장 이상 올려 주세요."
      : health.isPending
        ? "AI 영상 연결 상태를 확인하고 있어요."
        : health.isError
          ? "서버 연결 상태를 확인하지 못했습니다. 서버가 실행 중인지 확인하고 다시 시도해 주세요."
          : !health.data?.video?.enabled
            ? "Runway API 키가 연결되지 않아 AI 영상 생성을 시작할 수 없습니다."
            : plan.isError
              ? "사진 목록을 확인하지 못했습니다. 서버를 최신 버전으로 재시작한 뒤 다시 확인해 주세요."
              : !plan.data
                ? "생성할 사진 목록을 확인하고 있어요."
                : "";
  const missingConnection = health.isSuccess && !health.data?.video?.enabled;
  return (
    <section className="panel auto-video-panel">
      <div className="panel-title">
        <Sparkles />
        <h2>사진만 고르면, 편집까지 한 번에</h2>
      </div>
      <p>
        올린 사진을 모두 움직이는 영상으로 만들고, 선택한 컨셉에 맞춰 컷
        길이·자막·배경음악을 편집합니다.
      </p>
      <ol className="auto-video-steps">
        <li>전체 사진 영상화</li>
        <li>리뷰 자막 · 자동 편집</li>
        <li>완성 숏츠 저장</li>
      </ol>
      <div className="info-box">
        <b>기본 연출 · 손으로 사용하는 문구 리뷰</b>
        <p>
          자연광이 드는 책상에서 한 손이 제품을 사용하는 장면을 만듭니다.
          상품명에 맞춰 노트는 표지 열기, 필기구는 선 긋기처럼 동작을 자동으로
          정합니다.
        </p>
        {plan.data?.prompt && (
          <details>
            <summary>자동으로 들어가는 명령어 보기</summary>
            <p>{plan.data.prompt}</p>
          </details>
        )}
        <p className="help">
          새로 생성하는 영상에 적용됩니다. 같은 사진과 명령어로 완성한 영상만
          재사용합니다. 기존 작업의 ‘재시도’는 당시 명령어를 유지합니다.
        </p>
      </div>
      <div className="auto-photo-strip">
        {photos.map((photo, index) => {
          const state = plan.data?.photos.find(
            (p) => p.assetId === photo.id,
          )?.status;
          return (
            <div key={photo.id}>
              <img src={photo.url} alt={`사진 ${index + 1}`} />
              <span>
                {state === "completed"
                  ? "영상 재사용"
                  : state === "failed"
                    ? "생성 실패 · 입력 확인"
                    : state === "processing" || state === "checking"
                      ? "이어서 확인"
                      : `사진 ${index + 1}`}
              </span>
            </div>
          );
        })}
      </div>
      {plan.data && (
        <p>
          <b>사진 {photos.length}장</b> · 새로 생성{" "}
          {Math.max(0, photos.length - completed - resume)}개 · 기존 영상{" "}
          {completed}개 재사용
          {resume > 0 ? ` · 진행하던 생성 ${resume}개 이어서 확인` : ""}
        </p>
      )}
      <label className="auto-narration">
        <input
          type="checkbox"
          checked={narration}
          disabled={disabled}
          onChange={(e) => setNarration(e.target.checked)}
        />
        자막을 읽는 AI 내레이션도 넣기 (추가 유료)
      </label>
      <p className="help">
        사진이 Runway로 전송되며 새 영상 생성에 크레딧이 사용됩니다. 완료된
        영상은 재사용하고, 실패하면 남은 작업부터 이어갑니다. 생성된 상품 모양과
        글씨는 완성 후 확인해 주세요.
      </p>
      {project.board ? (
        <p className="help">
          현재 편집본은 전체 사진을 사용하는 새 구성으로 바뀝니다. 기존 완성
          영상은 유지됩니다.
        </p>
      ) : (
        <p className="help">
          상품 정보와 컨셉을 먼저 저장해 주세요. 사진은 대표 사진부터 업로드
          순서대로 사용합니다.
        </p>
      )}
      {blockedReason && (
        <div className="info-box" id={availabilityId} role="status">
          <p>
            <b>{blockedReason}</b>
          </p>
          {missingConnection &&
            (window.paperDesktop ? (
              <p>
                스튜디오 설정 → 프로그램 연결과 저장 폴더에서 Runway API 키를
                입력하고 ‘연결·저장 폴더 적용’을 눌러 주세요.
              </p>
            ) : (
              <p>
                프로젝트 폴더의 <code>.env</code>에 <code>RUNWAY_API_KEY</code>
                를 설정한 뒤 API 서버와 worker를 재시작해 주세요. 설치형 앱에
                저장한 키는 웹 실행에 자동으로 적용되지 않습니다.
              </p>
            ))}
          {(missingConnection || health.isError || plan.isError) && (
            <div className="actions">
              {missingConnection && (
                <a className="button" href="#settings">
                  연결 설정 안내
                </a>
              )}
              <button
                type="button"
                disabled={health.isFetching || plan.isFetching}
                onClick={() =>
                  void Promise.all([health.refetch(), plan.refetch()])
                }
              >
                {health.isFetching || plan.isFetching
                  ? "확인 중…"
                  : "연결·사진 다시 확인"}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        className="primary"
        disabled={!!blockedReason}
        aria-describedby={blockedReason ? availabilityId : undefined}
        onClick={() =>
          void run(async () => {
            const revision = beforeStart
              ? await beforeStart()
              : project.revision;
            await api(
              `/projects/${project.id}/auto-video`,
              send("POST", {
                revision,
                narration,
                useCurrentEdit: !!beforeStart,
              }),
            );
            onStart();
          }, "전체 사진으로 숏츠를 만들고 있어요. 완료되면 완성 영상에 표시됩니다.")
        }
      >
        <Sparkles size={17} />
        전체 사진으로 숏츠 완성하기 (유료)
      </button>
    </section>
  );
}
