import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Player } from "@remotion/player";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Film,
  FolderOpen,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  Palette,
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  defaultStyle,
  layouts,
  motionNames,
  normalizeScenes,
  setSceneDuration,
  productSchema,
  statusNames,
  terminal,
  transitions,
  type Asset,
  type Board,
  type Job,
  type Preset,
  type Product,
  type Scene,
  type Style,
} from "../../../packages/shared-schema";
import { ShortsVideo, type VideoProps } from "../../renderer/src/Video";
import { api, send } from "./api";
import { PresetFields } from "./PresetFields";
import { DesktopSettings } from "./DesktopSettings";
import { AutoVideoPanel } from "./AutoVideoPanel";

type Project = {
  id: string;
  name: string;
  info: Product;
  status: string;
  created_at: string;
  updated_at: string;
  assets: Asset[];
  board: Board | null;
  revision: number;
  analysis: any;
  jobs: Job[];
  outputs: {
    id: string;
    jobId: string;
    variant: number;
    verification: any;
    downloads: Record<string, string>;
  }[];
};
type Route = {
  page: "home" | "new" | "studio" | "presets" | "settings";
  id?: string;
};
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
type Ask = (message: string, action: () => Promise<unknown>) => void;
const icons = {
  home: FolderOpen,
  new: Plus,
  studio: Film,
  presets: Palette,
  settings: Settings,
};
const goals: Record<string, string> = {
  sales: "판매",
  awareness: "인지도",
  information: "정보",
  emotion: "감성",
  fun: "재미",
  engagement: "관심",
};
const motionLabels: Record<string, string> = {
  zoom_in: "천천히 확대",
  zoom_out: "천천히 축소",
  pan_left: "왼쪽으로",
  pan_right: "오른쪽으로",
  still: "고정",
};
const layoutLabels: Record<string, string> = {
  full_bleed: "전체 이미지",
  blur_contain: "블러 배경",
  split: "2분할 비교",
  product_card: "제품 카드",
  features: "특징 3개",
  endcard: "가격·CTA 카드",
};
function routeFromHash(): Route {
  const [page, id] = location.hash.slice(1).split("/");
  return {
    page: ["new", "studio", "presets", "settings"].includes(page)
      ? (page as Route["page"])
      : "home",
    id,
  };
}
const go = (page: Route["page"], id?: string) => {
  location.hash = page + (id ? "/" + id : "");
};
const money = (n: number) => n.toLocaleString("ko-KR") + "원";
const timestamp = (s: string) => new Date(s).toLocaleDateString("ko-KR");
const busyJob = (p: Project) =>
  p.jobs?.find((j) => !terminal.includes(j.status));
const stripBuiltin = (p: Preset) => {
  const { builtin: _builtin, ...value } = p;
  return value;
};

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(0);
  const [confirm, setConfirm] = useState<{
    message: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const qc = useQueryClient();
  const presets = useQuery<Preset[]>({
    queryKey: ["presets"],
    queryFn: () => api("/presets"),
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api("/health"),
  });
  useEffect(() => {
    const listener = () => {
      setRoute(routeFromHash());
      setError("");
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const run: Run = useCallback(
    async (fn, success) => {
      setPending((n) => n + 1);
      setError("");
      try {
        await fn();
        await qc.invalidateQueries();
        if (success) setNotice(success);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.",
        );
      } finally {
        setPending((n) => n - 1);
      }
    },
    [qc],
  );
  const ask: Ask = (message, action) => setConfirm({ message, action });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span>
            종이상점<small>SHORTS STUDIO</small>
          </span>
        </a>
        <div className="workspace-label">나의 작업 공간</div>
        <nav>
          {(
            [
              ["home", "프로젝트"],
              ["presets", "컨셉 라이브러리"],
              ["settings", "스튜디오 설정"],
            ] as const
          ).map(([page, label]) => {
            const Icon = icons[page];
            return (
              <a
                key={page}
                className={
                  route.page === page ||
                  (page === "home" && ["new", "studio"].includes(route.page))
                    ? "active"
                    : ""
                }
                href={"#" + page}
              >
                <Icon size={19} />
                {label}
                {page === "presets" && (
                  <span className="nav-count">
                    {presets.data?.length || 20}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="mini-flower">✳</span>
          <b>
            사진 속 그대로,
            <br />
            새로운 이야기로.
          </b>
          <p>
            소중한 상품의 모습은 지키고
            <br />
            당신의 취향을 영상에 담아요.
          </p>
        </div>
        <div className="mode">
          <span className="mode-dot" />
          {health.data?.mode === "ai" ? "AI 연결됨" : "데모 모드"}
          <small>
            {health.data?.mode === "ai"
              ? health.data.model
              : "API 키 없이 시작할 수 있어요"}
          </small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span>작업 공간</span>
            <ChevronRight size={14} />
            <b>
              {route.page === "home"
                ? "프로젝트"
                : route.page === "new"
                  ? "새 쇼츠 만들기"
                  : route.page === "studio"
                    ? "편집 스튜디오"
                    : route.page === "presets"
                      ? "컨셉 라이브러리"
                      : "설정"}
            </b>
          </div>
          <span className="private-label">
            내부 워크스페이스 <span className="avatar">P</span>
          </span>
        </header>
        <div className="page">
          {(error || presets.error || health.error) && (
            <div className="alert error" role="alert">
              <b>처리하지 못했어요</b>
              <span>
                {error || presets.error?.message || health.error?.message}
              </span>
              <button
                className="icon"
                onClick={() => {
                  setError("");
                  void qc.invalidateQueries();
                }}
                aria-label="오류 닫기 및 다시 조회"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {presets.isPending ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              스튜디오를 준비하고 있어요…
            </div>
          ) : (
            <>
              {route.page === "home" && (
                <Dashboard
                  presets={presets.data || []}
                  run={run}
                  ask={ask}
                  pending={pending > 0}
                />
              )}
              {route.page === "new" && (
                <NewProject
                  presets={presets.data || []}
                  run={run}
                  pending={pending > 0}
                />
              )}
              {route.page === "studio" && route.id && (
                <Studio
                  key={route.id}
                  id={route.id}
                  presets={presets.data || []}
                  run={run}
                  ask={ask}
                  pending={pending > 0}
                />
              )}
              {route.page === "presets" && (
                <PresetManager
                  presets={presets.data || []}
                  run={run}
                  ask={ask}
                />
              )}
              {route.page === "settings" && (
                <SettingsPage run={run} ask={ask} />
              )}
            </>
          )}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          close={() => setConfirm(null)}
          accept={() => {
            const action = confirm.action;
            setConfirm(null);
            void run(action, "처리했습니다.");
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  message,
  close,
  accept,
}: {
  message: string;
  close: () => void;
  accept: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="confirm" onCancel={close} onClose={close}>
      <div className="modal-icon">
        <Trash2 />
      </div>
      <h2>한 번 더 확인해 주세요</h2>
      <p>{message}</p>
      <div className="actions">
        <button onClick={close} autoFocus>
          돌아가기
        </button>
        <button className="danger" onClick={accept}>
          확인하고 진행
        </button>
      </div>
    </dialog>
  );
}

function Dashboard({
  presets,
  run,
  ask,
  pending,
}: {
  presets: Preset[];
  run: Run;
  ask: Ask;
  pending: boolean;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [concept, setConcept] = useState(""),
    [date, setDate] = useState("");
  const projects = useQuery<Project[]>({
    queryKey: ["projects", search, filter, concept, date],
    queryFn: () =>
      api(
        `/projects?${new URLSearchParams({ q: search, status: filter, concept, date })}`,
      ),
    refetchInterval: 4000,
  });
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">YOUR LITTLE CREATIVE STUDIO</div>
          <h1>오늘은 어떤 이야기를 만들까요?</h1>
          <p>상품 사진 몇 장으로, 우리 브랜드만의 문구 쇼츠를 만들어 보세요.</p>
        </div>
        <button className="primary" onClick={() => go("new")}>
          <Plus size={18} />새 쇼츠 만들기
        </button>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <Sparkles size={14} />
            사진에서 영상으로, 가볍게
          </span>
          <h2>
            작은 문구에
            <br />
            새로운 움직임을.
          </h2>
          <p>
            컨셉을 고르고, 문구를 다듬으면 준비 끝.
            <br />첫 번째 쇼츠를 샘플과 함께 만들어 보세요.
          </p>
          <button
            className="dark"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                const p = await api<Project>("/demo", send("POST"));
                go("studio", p.id);
              })
            }
          >
            샘플로 시작하기 <ArrowRight size={17} />
          </button>
          <span className="hero-meta">
            원본 사진 보존 · 20가지 컨셉 · 9:16 영상
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-spark a">✳</span>
          <div className="paper-note">
            <span>
              small things,
              <br />
              good days.
            </span>
            <div className="note-lines" />
            <b>DAILY PAPER</b>
          </div>
          <div className="phone-art">
            <div className="phone-brand">오늘의 문구 취향</div>
            <div className="mini-notebook">
              <span>P A P E R</span>
              <i>✳</i>
            </div>
            <span className="phone-caption">기록하고 싶은 하루</span>
            <span className="phone-play">
              <Play size={17} fill="currentColor" />
            </span>
          </div>
          <span className="floating-tag">
            <Film size={14} />
            사진이 쇼츠가 되는 순간
          </span>
          <span className="art-spark b">✧</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>
          내 프로젝트 <span>{projects.data?.length || 0}</span>
        </h2>
        <span>아이디어부터 완성 영상까지 한곳에서</span>
      </div>
      <div className="filterbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="프로젝트 검색"
            placeholder="프로젝트 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="상태 필터"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">모든 상태</option>
          {["draft", "ready", "queued", "rendering", "completed"].map((x) => (
            <option key={x} value={x}>
              {statusNames[x]}
            </option>
          ))}
        </select>
        <select
          aria-label="컨셉 필터"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
        >
          <option value="">모든 컨셉</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="생성 날짜"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {(date || filter || concept || search) && (
          <button
            onClick={() => {
              setSearch("");
              setDate("");
              setFilter("");
              setConcept("");
            }}
          >
            초기화
          </button>
        )}
      </div>
      {projects.error && (
        <div className="alert error">{projects.error.message}</div>
      )}
      {projects.isPending ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          프로젝트 불러오는 중
        </div>
      ) : (
        <div className="project-grid">
          <button className="new-tile" onClick={() => go("new")}>
            <span>
              <Plus size={28} />
            </span>
            <b>새로운 쇼츠 만들기</b>
            <small>사진을 올리고 이야기를 시작하세요</small>
          </button>
          {projects.data?.map((p) => (
            <article className="project-card" key={p.id}>
              <button
                className="project-cover"
                onClick={() => go("studio", p.id)}
                aria-label={`${p.name} 열기`}
              >
                {p.assets.find((a) => a.kind === "image") ? (
                  <img
                    src={
                      (
                        p.assets.find((a) => a.primary) ||
                        p.assets.find((a) => a.kind === "image")
                      )?.url
                    }
                    alt={p.name}
                  />
                ) : (
                  <ImagePlus size={40} />
                )}
                <span
                  className={
                    "status " + (p.status === "completed" ? "success" : "")
                  }
                >
                  {statusNames[p.status] || p.status}
                </span>
                <span className="duration">{p.info.duration}초 · 9:16</span>
              </button>
              <div className="project-info">
                <span className="card-concept">
                  {presets.find((x) => x.id === p.info.conceptId)?.name}
                </span>
                <h3>
                  <a href={"#studio/" + p.id}>{p.name}</a>
                </h3>
                <div className="card-bottom">
                  <small>{timestamp(p.updated_at)}</small>
                  <div>
                    <button
                      className="icon"
                      aria-label={`${p.name} 복제`}
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          const copy = await api<Project>(
                            `/projects/${p.id}/duplicate`,
                            send("POST"),
                          );
                          go("studio", copy.id);
                        })
                      }
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon"
                      aria-label={`${p.name} 삭제`}
                      onClick={() =>
                        ask(
                          "프로젝트와 업로드한 사진, 완성 영상이 모두 삭제됩니다.",
                          () => api(`/projects/${p.id}`, send("DELETE")),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="bottom-note">
        <span>✳</span>
        <p>좋은 이야기는 작은 취향에서 시작되니까요.</p>
        <span>PAPER STUDIO</span>
      </div>
    </>
  );
}

export function ConceptPicker({
  presets,
  value,
  onChange,
}: {
  presets: Preset[];
  value: string;
  onChange: (p: Preset) => void;
}) {
  const [q, setQ] = useState(""),
    [goal, setGoal] = useState("");
  return (
    <>
      <div className="filterbar compact">
        <label className="search">
          <Search size={16} />
          <input
            placeholder="컨셉 또는 시즌 검색"
            aria-label="컨셉 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="마케팅 목적"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        >
          <option value="">모든 목적</option>
          {Object.entries(goals).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="concept-grid">
        {presets
          .filter(
            (p) =>
              (
                p.name +
                " " +
                p.description +
                " " +
                p.seasonTags.join(" ")
              ).includes(q) &&
              (!goal || p.marketingGoal === goal),
          )
          .map((p) => (
            <button
              type="button"
              key={p.id}
              className={"concept-card " + (value === p.id ? "selected" : "")}
              aria-pressed={value === p.id}
              onClick={() => onChange(p)}
            >
              <div
                className="concept-art"
                style={{ background: p.palette[1], color: p.palette[0] }}
              >
                <span className={"concept-shape " + p.fontStyle}>
                  Aa<span>오늘의 문구</span>
                </span>
                <span className="concept-mark">
                  {p.fontStyle === "rounded"
                    ? "✳"
                    : p.fontStyle === "bold"
                      ? "↗"
                      : "✧"}
                </span>
                <span className="color-dots">
                  {p.palette.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                {value === p.id && (
                  <span className="selected-check">
                    <Check size={14} />
                  </span>
                )}
              </div>
              <b>{p.name}</b>
              <small>
                {goals[p.marketingGoal]} ·{" "}
                {p.pace === "slow"
                  ? "느긋하게"
                  : p.pace === "fast"
                    ? "빠르게"
                    : "보통"}
              </small>
            </button>
          ))}
      </div>
    </>
  );
}

export function StyleFields({
  value,
  onChange,
}: {
  value: Style;
  onChange: (s: Style) => void;
}) {
  const field = (
    key: keyof Style,
    label: string,
    options: Record<string, string>,
  ) => (
    <label>
      {label}
      <select
        value={String(value[key])}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      >
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="form-grid style-fields">
      {field("pace", "영상 속도", {
        slow: "느긋하게",
        normal: "보통",
        fast: "빠르게",
      })}
      {field("captionStyle", "자막 스타일", {
        clean: "깔끔한 고딕",
        bold: "굵은 강조",
        rounded: "둥근 귀여움",
        handwritten: "손글씨 느낌",
        magazine: "잡지형",
      })}
      {field("musicMood", "음악 분위기", {
        none: "없음",
        bright_cute: "밝고 귀여움",
        lofi: "잔잔한 Lo-fi",
        trendy: "트렌디",
        premium: "고급",
        retro: "레트로",
      })}
      {field("narration", "내레이션", {
        none: "없음",
        ai: "AI 음성 (Runway 또는 ElevenLabs)",
        script: "대본만 생성",
      })}
      <label>
        내레이션 읽기 기준
        <select
          value={value.narrationSource || "script"}
          onChange={(e) =>
            onChange({
              ...value,
              narrationSource: e.target.value as "caption" | "script",
            })
          }
        >
          <option value="caption">현재 자막 자동 읽기</option>
          <option value="script">별도 내레이션 원고 읽기</option>
        </select>
      </label>
      {field("priceDisplay", "가격 표시", {
        hidden: "숨김",
        middle: "중간",
        last: "마지막",
        always: "계속 강조",
      })}
      <label>
        브랜드 색상
        <input
          type="color"
          value={value.brandColor}
          onChange={(e) => onChange({ ...value, brandColor: e.target.value })}
        />
      </label>
      <label>
        생성 개수
        <select
          value={value.variants}
          onChange={(e) =>
            onChange({ ...value, variants: Number(e.target.value) })
          }
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}개 변형
            </option>
          ))}
        </select>
      </label>
      <label>
        음악 볼륨 · {Math.round(value.volume * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.volume}
          onChange={(e) =>
            onChange({ ...value, volume: Number(e.target.value) })
          }
        />
      </label>
      <label>
        페이드 인·아웃 (초)
        <input
          type="number"
          min="0"
          max="5"
          step="0.5"
          value={value.fadeSec}
          onChange={(e) =>
            onChange({ ...value, fadeSec: Number(e.target.value) })
          }
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.ducking}
          onChange={(e) => onChange({ ...value, ducking: e.target.checked })}
        />
        내레이션 중 음악 작게
      </label>
    </div>
  );
}

function ProductForm({
  initial,
  presets,
  onSubmit,
  pending,
  children,
}: {
  initial: Product;
  presets: Preset[];
  onSubmit: (p: Product) => Promise<void>;
  pending: boolean;
  children?: React.ReactNode;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Product>({
    resolver: zodResolver(productSchema),
    defaultValues: initial,
  });
  const style = watch("style"),
    concept = watch("conceptId");
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <section className="panel">
        <div className="panel-title">
          <span className="step">01</span>
          <div>
            <h2>상품을 소개해 주세요</h2>
            <p>직접 입력한 특징과 가격을 바탕으로 문구를 만들어요.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            제품명 <em>*</em>
            <input
              {...register("name")}
              placeholder="예: 데일리 리프 노트"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <small className="field-error">{errors.name.message}</small>
            )}
          </label>
          <label>
            판매가 (원) <em>*</em>
            <input
              {...register("price", { valueAsNumber: true })}
              type="number"
              min="0"
              step="1"
            />
            {errors.price && (
              <small className="field-error">{errors.price.message}</small>
            )}
          </label>
          <label>
            상품 브랜드
            <input {...register("brand")} placeholder="우리 브랜드 이름" />
          </label>
          <label>
            광고 판매처 이름
            <input
              {...register("storeName")}
              maxLength={80}
              placeholder="예: 주아상사"
            />
          </label>
          <label className="full">
            판매처 주소 (영상에 표시)
            <input
              {...register("storeUrl")}
              type="url"
              maxLength={300}
              placeholder="https://smartstore.naver.com/jua"
            />
            <small className="help">
              판매처 이름은 영상 내내, 주소는 마지막 구매 안내에 표시됩니다.
            </small>
          </label>
          <label>
            타깃 고객
            <input
              {...register("audience")}
              placeholder="예: 다꾸를 좋아하는 학생"
            />
          </label>
          <label className="full">
            상품 특징
            <textarea
              {...register("features")}
              rows={3}
              placeholder="확실한 특징을 한 줄에 하나씩 적어 주세요."
            />
          </label>
          <label>
            마지막 안내 문구 (CTA)
            <input {...register("cta")} />
          </label>
          <label>
            영상 길이
            <select {...register("duration", { valueAsNumber: true })}>
              <option value="15">15초</option>
              <option value="20">20초</option>
              <option value="30">30초</option>
            </select>
          </label>
        </div>
        {Object.keys(errors).filter((k) => !["name", "price"].includes(k))
          .length > 0 && (
          <div className="alert error">
            입력 길이 또는 스타일 값을 확인해 주세요.
          </div>
        )}
      </section>
      {children}
      <section className="panel">
        <div className="panel-title">
          <span className="step">03</span>
          <div>
            <h2>어떤 느낌으로 만들까요?</h2>
            <p>분석 후 AI 추천을 받을 수도 있어요.</p>
          </div>
        </div>
        <ConceptPicker
          presets={presets}
          value={concept}
          onChange={(p) => {
            setValue("conceptId", p.id);
            setValue("style", {
              ...style,
              pace: p.pace,
              captionStyle: p.fontStyle,
            });
          }}
        />
      </section>
      <section className="panel">
        <div className="panel-title">
          <SlidersHorizontal />
          <h2>취향을 조금 더 더하기</h2>
        </div>
        <StyleFields value={style} onChange={(s) => setValue("style", s)} />
        <p className="help">
          기본 음악은 스튜디오에서 직접 합성한 데모 음원입니다. 업로드한 음원이
          있으면 우선 사용합니다.
        </p>
      </section>
      <div className="sticky-actions">
        <span>사진과 상품의 원형을 그대로 보존합니다.</span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Check size={18} />
          )}
          상품 정보 저장
        </button>
      </div>
    </form>
  );
}

function NewProject({
  presets,
  run,
  pending,
}: {
  presets: Preset[];
  run: Run;
  pending: boolean;
}) {
  const defaults = useQuery({
    queryKey: ["settings"],
    queryFn: () => api("/settings"),
  });
  const [files, setFiles] = useState<File[]>([]),
    [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach(URL.revokeObjectURL);
  }, [files]);
  const initial: Product = {
    name: "",
    price: 3500,
    brand: defaults.data?.defaults.brand || "",
    storeName: defaults.data?.defaults.storeName || "",
    storeUrl: defaults.data?.defaults.storeUrl || "",
    features: "",
    audience: "",
    cta: defaults.data?.defaults.cta || "오늘의 문구를 만나보세요",
    duration: 15,
    conceptId: "review",
    style: {
      ...defaultStyle,
      pace: "fast",
      captionStyle: "bold",
      musicMood: "trendy",
      brandColor: defaults.data?.defaults.brandColor || defaultStyle.brandColor,
    },
  };
  return (
    <>
      <div className="heading">
        <div>
          <button className="text-button" onClick={() => go("home")}>
            <ArrowLeft size={15} />
            프로젝트로
          </button>
          <h1>새로운 쇼츠 만들기</h1>
          <p>상품의 이야기를 시작하는 첫 단계예요.</p>
        </div>
      </div>
      {defaults.isPending ? (
        <p>기본 설정을 불러오는 중…</p>
      ) : (
        <ProductForm
          initial={initial}
          presets={presets}
          pending={pending}
          onSubmit={async (data) => {
            if (!files.length) {
              setError("제품 사진을 한 장 이상 선택해 주세요.");
              return;
            }
            await run(async () => {
              const p = await api<Project>("/projects", send("POST", data));
              go("studio", p.id);
              for (const file of files) {
                const form = new FormData();
                form.append("file", file);
                await api(`/projects/${p.id}/assets`, {
                  method: "POST",
                  body: form,
                });
              }
            }, "프로젝트를 만들었습니다.");
          }}
        >
          <section className="panel">
            <div className="panel-title">
              <span className="step">02</span>
              <div>
                <h2>상품 사진을 올려 주세요</h2>
                <p>JPG · PNG · WebP / 최대 12장 / 파일당 20MB</p>
              </div>
            </div>
            <label
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFiles((prev) =>
                  [...prev, ...Array.from(e.dataTransfer.files)].slice(0, 12),
                );
              }}
            >
              <ImagePlus size={32} />
              <b>사진을 끌어 놓거나 클릭해서 선택하세요</b>
              <span>HEIC는 JPG로 변환 후 업로드해 주세요</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                aria-label="제품 사진 선택"
                onChange={(e) =>
                  setFiles((prev) =>
                    [...prev, ...Array.from(e.target.files || [])].slice(0, 12),
                  )
                }
              />
            </label>
            {error && <div className="alert error">{error}</div>}
            <div className="upload-grid">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="upload-item"
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", String(i))
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    const next = [...files];
                    next.splice(i, 0, next.splice(from, 1)[0]);
                    setFiles(next);
                  }}
                >
                  <img src={urls[i]} alt={f.name} />
                  <small>{i === 0 ? "대표 사진" : `${i + 1}번 사진`}</small>
                  <button
                    type="button"
                    className="icon remove"
                    aria-label={`${f.name} 제거`}
                    onClick={() => setFiles(files.filter((_, n) => n !== i))}
                  >
                    <X size={15} />
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={i === 0}
                    onClick={() =>
                      setFiles([f, ...files.filter((_, n) => n !== i)])
                    }
                  >
                    대표로
                  </button>
                </div>
              ))}
            </div>
            {files.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => setFiles([])}
              >
                선택한 사진 전체 비우기
              </button>
            )}
          </section>
        </ProductForm>
      )}
    </>
  );
}

function AssetManager({
  project,
  run,
  ask,
  disabled,
}: {
  project: Project;
  run: Run;
  ask: Ask;
  disabled: boolean;
}) {
  const photos = project.assets.filter((a) => a.kind === "image");
  const upload = async (files: FileList | null, kind: string) => {
    if (!files) return;
    await run(async () => {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        await api(`/projects/${project.id}/assets?kind=${kind}`, {
          method: "POST",
          body: form,
        });
      }
    }, "파일을 추가했습니다.");
  };
  const reorder = (from: number, to: number, primaryId?: string) =>
    run(async () => {
      const ids = photos.map((a) => a.id);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await api(
        `/projects/${project.id}/assets/order`,
        send("PUT", {
          ids,
          primaryId: primaryId || photos.find((a) => a.primary)?.id || ids[0],
        }),
      );
    });
  return (
    <section className="panel">
      <div className="panel-title">
        <ImagePlus />
        <h2>
          상품 사진 <small>{photos.length}/12</small>
        </h2>
      </div>
      <div className="upload-grid">
        {photos.map((a, i) => (
          <div
            className="upload-item"
            key={a.id}
            draggable={!disabled}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!disabled)
                void reorder(Number(e.dataTransfer.getData("text/plain")), i);
            }}
          >
            <img src={a.url} alt={a.filename} />
            <span className="image-badge">{a.primary ? "대표" : i + 1}</span>
            <button
              type="button"
              className="icon remove"
              disabled={disabled}
              aria-label={`${a.filename} 삭제`}
              onClick={() =>
                ask(
                  "이 사진을 삭제할까요? 사용 중인 장면에는 다른 사진이 배치됩니다.",
                  () =>
                    api(
                      `/projects/${project.id}/assets/${a.id}`,
                      send("DELETE"),
                    ),
                )
              }
            >
              <X size={15} />
            </button>
            <div className="image-actions">
              <button
                type="button"
                className="icon"
                disabled={disabled || i === 0}
                aria-label="사진 앞으로"
                onClick={() => void reorder(i, i - 1)}
              >
                <ArrowLeft size={14} />
              </button>
              <button
                type="button"
                className="text-button"
                disabled={disabled || a.primary}
                onClick={() => void reorder(i, i, a.id)}
              >
                대표로
              </button>
              <button
                type="button"
                className="icon"
                disabled={disabled || i === photos.length - 1}
                aria-label="사진 뒤로"
                onClick={() => void reorder(i, i + 1)}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="asset-tools">
        <label className="button">
          <Upload size={16} />
          사진 추가
          <input
            type="file"
            hidden
            multiple
            disabled={disabled || photos.length >= 12}
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void upload(e.target.files, "image");
              e.target.value = "";
            }}
          />
        </label>
        {photos.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              ask(
                "모든 상품 사진과 현재 스토리보드를 삭제할까요? 완성 영상은 유지됩니다.",
                () => api(`/projects/${project.id}/assets`, send("DELETE")),
              )
            }
          >
            사진 전체 삭제
          </button>
        )}
        {(["logo", "audio"] as const).map((kind) => {
          const a = project.assets.find((x) => x.kind === kind);
          return (
            <div className="asset-extra" key={kind}>
              {a ? (
                <>
                  <span>
                    {kind === "logo" ? "로고" : "음원"}: {a.filename}
                  </span>
                  <button
                    type="button"
                    className="icon"
                    disabled={disabled}
                    aria-label={`${kind} 삭제`}
                    onClick={() =>
                      ask("이 파일을 삭제할까요?", () =>
                        api(
                          `/projects/${project.id}/assets/${a.id}`,
                          send("DELETE"),
                        ),
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                </>
              ) : (
                <label className="button">
                  <Plus size={15} />
                  {kind === "logo" ? "로고" : "보유 음원"} 업로드
                  <input
                    type="file"
                    hidden
                    disabled={disabled}
                    accept={
                      kind === "logo"
                        ? "image/png,image/jpeg,image/webp"
                        : ".mp3,.wav,.m4a,.ogg"
                    }
                    onChange={(e) => {
                      void upload(e.target.files, kind);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="help">
        사진을 끌어 순서를 바꿀 수 있어요. 업로드하는 음원의 사용 권한을 확인해
        주세요.
      </p>
    </section>
  );
}

function Studio({
  id,
  presets,
  run,
  ask,
  pending,
}: {
  id: string;
  presets: Preset[];
  run: Run;
  ask: Ask;
  pending: boolean;
}) {
  const [tab, setTab] = useState("setup"),
    [recommend, setRecommend] = useState<any[]>([]);
  const project = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: () => api(`/projects/${id}`),
    refetchInterval: 1500,
  });
  const p = project.data;
  const lastAutoJob = useRef<string | undefined>(undefined);
  useEffect(() => {
    const job = p?.jobs[0];
    if (job?.kind === "auto_video" && !terminal.includes(job.status)) {
      lastAutoJob.current = job.id;
    } else if (job?.kind === "auto_video" && job.status === "completed" && lastAutoJob.current === job.id) {
      setTab("results");
      lastAutoJob.current = undefined;
    }
  }, [p?.jobs]);
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (p?.board && !previous.current) {
      setTab(p.jobs[0]?.kind === "auto_video" ? "results" : "edit");
      previous.current = "loaded";
    }
  }, [p?.board, p?.jobs]);
  if (project.isPending)
    return (
      <div className="empty">
        <LoaderCircle className="spin" />
        프로젝트 불러오는 중…
      </div>
    );
  if (!p)
    return (
      <div className="alert error">
        {project.error?.message || "프로젝트가 없습니다."}
      </div>
    );
  const active = busyJob(p),
    locked = !!active || pending;
  return (
    <>
      <div className="heading">
        <div>
          <button className="text-button" onClick={() => go("home")}>
            <ArrowLeft size={15} />
            프로젝트로
          </button>
          <h1>{p.name}</h1>
          <p>
            {money(p.info.price)} · {p.info.duration}초 ·{" "}
            {presets.find((x) => x.id === p.info.conceptId)?.name}
          </p>
        </div>
        <span className="status">{statusNames[p.status]}</span>
      </div>
      <div className="tabs">
        {[
          ["setup", "1. 상품과 컨셉"],
          ["edit", "2. 스토리보드"],
          [
            "results",
            `3. 완성 영상${p.outputs.length ? " · " + p.outputs.length : ""}`,
          ],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {active && (
        <JobStatus
          job={active}
          onCancel={() =>
            void run(
              () => api(`/jobs/${active.id}/cancel`, send("POST")),
              "취소를 요청했습니다.",
            )
          }
          disabled={pending}
        />
      )}
      {p.jobs[0]?.status === "failed" && (
        <div className="alert error">
          <b>{statusNames[p.jobs[0].kind] || "작업"} 실패</b>
          <span>
            {p.jobs[0].error}
            {p.jobs[0].photos && <small>전체 {p.jobs[0].photos.length}장 중 {p.jobs[0].photos.filter(photo => photo.status === "completed").length}장 완료 · 완료된 영상은 저장되어 있습니다.</small>}
            <small>실패 단계: {p.jobs[0].error_code}</small>
          </span>
          <button
            disabled={locked}
            onClick={() =>
              void run(() => api(`/jobs/${p.jobs[0].id}/retry`, send("POST")))
            }
          >
            재시도
          </button>
        </div>
      )}
      {p.jobs[0]?.status === "cancelled" && (
        <div className="alert">
          <span>작업이 취소되었습니다.</span>
          <button
            disabled={locked}
            onClick={() =>
              void run(() => api(`/jobs/${p.jobs[0].id}/retry`, send("POST")))
            }
          >
            다시 시도
          </button>
        </div>
      )}
      {tab === "setup" && (
        <>
          <ProductForm
            key={JSON.stringify(p.info)}
            initial={p.info}
            presets={presets}
            pending={locked}
            onSubmit={(data) =>
              run(
                () => api(`/projects/${id}`, send("PUT", data)),
                "상품 정보를 저장했습니다.",
              )
            }
          >
            <AssetManager project={p} run={run} ask={ask} disabled={locked} />
          </ProductForm>
          <AutoVideoPanel project={p} disabled={locked} run={run} onStart={() => setTab("results")} />
          <section className="panel">
            <div className="panel-title">
              <Sparkles />
              <h2>상품을 이해하고, 장면으로 구성해요</h2>
            </div>
            <div className="actions">
              <button
                disabled={locked || !p.assets.some((a) => a.kind === "image")}
                onClick={() =>
                  void run(() => api(`/projects/${id}/analyze`, send("POST")))
                }
              >
                <Sparkles size={17} />
                상품 분석·컨셉 추천
              </button>
              <button
                disabled={locked}
                onClick={() =>
                  void run(async () =>
                    setRecommend(
                      await api(
                        `/projects/${id}/recommendations?different=true`,
                      ),
                    ),
                  )
                }
              >
                다른 느낌 추천
              </button>
              <button
                className="primary"
                disabled={locked || !p.assets.some((a) => a.kind === "image")}
                onClick={() => {
                  const action = async () => {
                    await api(
                      `/projects/${id}/storyboard/generate`,
                      send("POST"),
                    );
                    setTab("edit");
                  };
                  if (p.board)
                    ask("현재 편집본을 새 구성으로 바꿀까요?", action);
                  else void run(action);
                }}
              >
                <Clapperboard size={17} />
                {p.board ? "스토리보드 다시 구성" : "스토리보드 만들기"}
              </button>
            </div>
            <p className="help">
              위에서 상품 정보와 컨셉을 저장한 후 분석하세요. 분석과 장면 구성은
              백그라운드에서 진행됩니다.
            </p>
            {p.analysis && <AnalysisView analysis={p.analysis} />}
            <div className="recommendations">
              {(recommend.length
                ? recommend
                : p.analysis?.recommendations || []
              ).map((r: any) => (
                <div key={r.conceptId}>
                  <span className="score">
                    {r.score}
                    <small>점</small>
                  </span>
                  <b>{presets.find((x) => x.id === r.conceptId)?.name}</b>
                  <p>{r.reason}</p>
                  <button
                    disabled={locked}
                    onClick={() =>
                      void run(async () => {
                        const preset = presets.find(
                          (x) => x.id === r.conceptId,
                        )!;
                        await api(
                          `/projects/${id}`,
                          send("PUT", {
                            ...p.info,
                            conceptId: r.conceptId,
                            style: {
                              ...p.info.style,
                              pace: preset.pace,
                              captionStyle: preset.fontStyle,
                            },
                          }),
                        );
                      })
                    }
                  >
                    이 컨셉 적용
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "edit" &&
        (p.board ? (
          <Editor
            key={
              id +
              "-" +
              p.jobs.filter(
                (j) => j.kind === "storyboard" && j.status === "completed",
              ).length
            }
            project={p}
            presets={presets}
            locked={locked}
            run={run}
            ask={ask}
            onRender={() => setTab("results")}
          />
        ) : (
          <div className="empty">
            <Clapperboard size={36} />
            <h2>
              {active
                ? "상품을 분석하고 장면을 구성하고 있어요"
                : "아직 스토리보드가 없어요"}
            </h2>
            <p>
              상품과 컨셉 탭에서 사진과 정보를 저장한 뒤 장면을 생성해 주세요.
            </p>
            <button onClick={() => setTab("setup")}>상품과 컨셉으로</button>
          </div>
        ))}
      {tab === "results" && <Results project={p} />}
    </>
  );
}

function AnalysisView({ analysis: a }: { analysis: any }) {
  return (
    <div className="analysis">
      <div className="pill">
        {a.mode === "ai"
          ? "AI 분석"
          : a.mode === "fallback"
            ? "안전한 폴백"
            : "데모 분석"}
      </div>
      <h3>{a.category}</h3>
      {a.notice && <p>{a.notice}</p>}
      <div className="analysis-columns">
        <div>
          <b>확인한 특징</b>
          <ul>
            {(a.verifiedFeatures.length
              ? a.verifiedFeatures
              : ["사진만으로 확인되지 않은 특징은 추가하지 않았어요."]
            ).map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <b>직접 입력한 특징</b>
          <ul>
            {a.userFeatures.map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="help">{a.uncertainClaims.join(" ")}</p>
      <div className="quality-list">
        {a.photos.map((p: any, i: number) => (
          <span key={p.assetId}>
            사진 {i + 1} · {p.role} · 품질 {p.quality}점
          </span>
        ))}
      </div>
    </div>
  );
}

export function JobStatus({
  job,
  onCancel,
  disabled = false,
}: {
  job: Job;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="job-panel" aria-live="polite">
      <div>
        <LoaderCircle className="spin" />
        <div>
          <b>
            {job.kind === "auto_video" ? "전체 사진 자동 제작 · " : job.kind === "video" ? "AI 영상 생성 · " : ""}
            {(job.kind === "video" || job.kind === "auto_video") && job.status === "images" && job.phase !== "render"
              ? "움직임 생성 중"
              : statusNames[job.status] || job.status}
          </b>
          <p>
            다른 탭을 볼 수 있어요. 완료될 때까지 프로그램은 켜 두세요. · {Math.floor(job.progress)}%
          </p>
        </div>
        <button disabled={disabled} onClick={onCancel}>
          작업 취소
        </button>
      </div>
      <progress aria-label="작업 진행률" value={job.progress} max="100" />
      {job.photos && <div className="auto-job-photos">
        <p>영상 준비 {job.photos.filter(p => p.status === "completed").length} / {job.photos.length}장 · {job.phase === "render" ? "자막·음악을 합쳐 완성하는 중" : "완료된 영상은 자동으로 저장됩니다"}</p>
        <ul>{job.photos.map((photo, index) => <li key={photo.assetId}><span>사진 {index + 1} · {photo.filename}</span><b>{({ completed: "완료", processing: "생성 중", checking: "접수 확인", pending: "대기", failed: "생성 실패" } as Record<string, string>)[photo.status]}</b></li>)}</ul>
      </div>}
      <div className="job-steps">
        {(job.kind === "auto_video"
          ? ["storyboarding", "images", "audio", "rendering", "completed"]
          : job.kind === "video"
          ? ["queued", "images", "verifying", "completed"]
          : [
              "queued",
              "preparing",
              "images",
              "audio",
              "rendering",
              "verifying",
              "completed",
            ]
        ).map((s) => (
          <span key={s} className={s === job.status ? "current" : ""}>
            {job.kind === "auto_video" && s === "images" ? "전체 사진 영상화" : statusNames[s]}
          </span>
        ))}
      </div>
    </section>
  );
}

function Editor({
  project: p,
  presets,
  locked,
  run,
  ask,
  onRender,
}: {
  project: Project;
  presets: Preset[];
  locked: boolean;
  run: Run;
  ask: Ask;
  onRender: () => void;
}) {
  const [board, setBoard] = useState<Board>(p.board!),
    [selected, setSelected] = useState(0),
    [saveState, setSaveState] = useState("모든 변경사항 저장됨"),
    [saveError, setSaveError] = useState("");
  const revision = useRef(p.revision),
    latest = useRef(board),
    saved = useRef(JSON.stringify(board)),
    inflight = useRef<Promise<void> | null>(null);
  const videoHealth = useQuery<{
    video?: { enabled: boolean; model: string };
    tts?: boolean;
    ttsProvider?: string;
  }>({
    queryKey: ["video-health"],
    queryFn: () => api("/health"),
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (
      p.board &&
      p.revision > revision.current &&
      !inflight.current &&
      JSON.stringify(latest.current) === saved.current
    ) {
      revision.current = p.revision;
      saved.current = JSON.stringify(p.board);
      latest.current = p.board;
      setBoard(p.board);
    }
  }, [p.board, p.revision]);
  const flush = useCallback(async () => {
    while (inflight.current) await inflight.current;
    const data = latest.current,
      serialized = JSON.stringify(data);
    if (serialized === saved.current) return;
    setSaveState("저장 중…");
    setSaveError("");
    const promise = api<{ data: Board; revision: number }>(
      `/projects/${p.id}/storyboard`,
      send("PUT", { data, revision: revision.current }),
    )
      .then((result) => {
        revision.current = result.revision;
        saved.current = serialized;
        setSaveState("모든 변경사항 저장됨");
      })
      .catch((e) => {
        setSaveState("저장 실패");
        setSaveError(e.message);
        throw e;
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = promise;
    await promise;
  }, [p.id]);
  useEffect(() => {
    latest.current = board;
    if (JSON.stringify(board) === saved.current) return;
    setSaveState("변경사항 저장 대기");
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [board, flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush().catch(() => {});
    };
  }, [flush]);
  const change = (next: Board) => {
    latest.current = next;
    setBoard(next);
  };
  const scene = board.scenes[selected] || board.scenes[0];
  const patch = (data: Partial<Scene>) =>
    change({
      ...board,
      scenes: normalizeScenes(
        board.scenes.map((s, i) => (i === selected ? { ...s, ...data } : s)),
        board.durationSec,
      ),
    });
  const preset = presets.find((x) => x.id === board.conceptId) || presets[0];
  const props: VideoProps = {
    board,
    preset,
    assets: Object.fromEntries(
      p.assets
        .filter((a) => a.kind === "image")
        .map((a) => [a.id, { src: a.url, width: a.width, height: a.height }]),
    ),
    logo: p.assets.find((a) => a.kind === "logo")?.url,
    videos: Object.fromEntries(
      p.assets
        .filter((a) => a.kind === "video")
        .map((a) => [a.id, { src: a.url }]),
    ),
    brand: p.info.brand,
    storeName: p.info.storeName,
    storeUrl: p.info.storeUrl,
  };
  const reorder = (from: number, to: number) => {
    const scenes = [...board.scenes];
    scenes.splice(to, 0, scenes.splice(from, 1)[0]);
    change({ ...board, scenes: normalizeScenes(scenes, board.durationSec) });
    setSelected(to);
  };
  return (
    <>
      <div className="editor-top">
        <span className="save-status">
          <Check size={15} />
          {saveState}
        </span>
        <div className="actions">
          <button
            disabled={locked}
            onClick={() =>
              ask("수정한 장면을 초기 AI 구성으로 되돌릴까요?", async () => {
                await flush();
                const b = await api<{ data: Board; revision: number }>(
                  `/projects/${p.id}/storyboard/reset`,
                  send("POST"),
                );
                revision.current = b.revision;
                saved.current = JSON.stringify(b.data);
                change(b.data);
                setSelected(0);
              })
            }
          >
            초기 구성으로
          </button>
          <button
            className="primary"
            disabled={locked}
            onClick={() =>
              void run(async () => {
                await flush();
                await api(`/projects/${p.id}/renders`, send("POST"));
                onRender();
              })
            }
          >
            <Film size={17} />
            {board.style.variants}개 영상 렌더링
          </button>
        </div>
      </div>
      <AutoVideoPanel project={p} disabled={locked} run={run} beforeStart={async () => { await flush(); return revision.current; }} onStart={onRender} />
      <section className="panel audio-settings">
        <div className="section-heading">
          <div>
            <h2>음악과 자동 내레이션</h2>
            <p>장면의 자막을 읽고 배경음악과 함께 완성 영상에 넣습니다.</p>
          </div>
          <button
            disabled={locked}
            onClick={() =>
              change({
                ...board,
                style: {
                  ...board.style,
                  narration: "ai",
                  narrationSource: "caption",
                  musicMood:
                    board.style.musicMood === "none"
                      ? "lofi"
                      : board.style.musicMood,
                  volume: board.style.volume === 0 ? 0.25 : board.style.volume,
                  ducking: true,
                },
              })
            }
          >
            음악 + 자막 내레이션 켜기
          </button>
        </div>
        <fieldset disabled={locked}>
          <div className="form-grid">
            <label>
              배경음악 선택
              <select
                aria-label="배경음악 선택"
                value={board.style.musicMood}
                onChange={(e) =>
                  change({
                    ...board,
                    style: {
                      ...board.style,
                      musicMood: e.target.value as Style["musicMood"],
                    },
                  })
                }
              >
                <option value="none">음악 없음</option>
                <option value="lofi">잔잔한 Lo-fi</option>
                <option value="bright_cute">밝고 귀여움</option>
                <option value="trendy">트렌디</option>
                <option value="premium">고급</option>
                <option value="retro">레트로</option>
              </select>
            </label>
            <label>
              자동 내레이션
              <select
                aria-label="자동 내레이션"
                value={
                  board.style.narration === "ai"
                    ? board.style.narrationSource || "script"
                    : "off"
                }
                onChange={(e) =>
                  change({
                    ...board,
                    style: {
                      ...board.style,
                      narration: e.target.value === "off" ? "script" : "ai",
                      narrationSource:
                        e.target.value === "caption" ? "caption" : "script",
                    },
                  })
                }
              >
                <option value="off">음성 없음</option>
                <option value="caption">자막을 자동으로 읽기</option>
                <option value="script">별도 원고 읽기</option>
              </select>
            </label>
          </div>
        </fieldset>
        <p className="help">
          {p.assets.some((a) => a.kind === "audio")
            ? "업로드한 음원이 배경음악으로 우선 적용됩니다. "
            : "기본 배경음악은 앱에서 생성합니다. "}
          {board.style.narration === "ai"
            ? videoHealth.data?.tts
              ? `${videoHealth.data.ttsProvider === "elevenlabs" ? "ElevenLabs" : "Runway"}로 음성을 생성합니다. 읽는 텍스트가 전송되고 API 비용이 발생합니다. 같은 원고의 음성은 저장해 재사용합니다.`
              : "음성 연결이 필요합니다. 스튜디오 설정에서 Runway 또는 ElevenLabs 연결을 확인하세요."
            : "내레이션을 켜면 자막을 음성으로 들을 수 있습니다."}
        </p>
        <small>
          설정을 저장한 뒤 ‘영상 렌더링’을 눌러 적용하세요. AI 영상 클립은 다시
          생성하지 않습니다. 편집 미리보기는 무음이며, 음악과 음성은 완성
          영상에서 재생됩니다.
        </small>
      </section>
      {saveError && (
        <div className="alert error">
          <span>{saveError}</span>
          <button onClick={() => void flush().catch(() => {})}>
            저장 재시도
          </button>
        </div>
      )}
      <div className="editor-layout">
        <section className="preview-panel">
          <div className="eyebrow">LIVE PREVIEW</div>
          <Player
            initialFrame={30}
            component={ShortsVideo}
            inputProps={props}
            durationInFrames={board.durationSec * 30}
            fps={30}
            compositionWidth={1080}
            compositionHeight={1920}
            style={{
              width: "100%",
              maxWidth: 320,
              aspectRatio: "9/16",
              borderRadius: 16,
              overflow: "hidden",
            }}
            controls
            loop
          />
          <p>{board.durationSec}초 · 1080×1920 · 30fps</p>
          <small>영상 디자인 미리보기 · 오디오는 완성 영상에 적용</small>
        </section>
        <section className="panel scene-editor">
          <div className="panel-title">
            <span className="step">
              {String(selected + 1).padStart(2, "0")}
            </span>
            <h2>장면 편집</h2>
            <span className="muted">
              {(scene.startFrame / 30).toFixed(1)}초부터
            </span>
          </div>
          <fieldset disabled={locked}>
            <div className="form-grid">
              <label className="full">
                자막
                <textarea
                  aria-label="장면 자막"
                  maxLength={120}
                  value={scene.caption}
                  onChange={(e) => patch({ caption: e.target.value })}
                  rows={2}
                />
                <small
                  className={scene.caption.length > 45 ? "field-error" : "help"}
                >
                  {scene.caption.length}/120 ·{" "}
                  {scene.caption.length > 45
                    ? "두 줄 이내로 줄이면 더 잘 읽혀요."
                    : "짧고 선명한 문구를 권장해요."}
                </small>
              </label>
              <label>
                사용할 사진
                <select
                  value={scene.assetId}
                  onChange={(e) =>
                    patch({ assetId: e.target.value, videoAssetId: null })
                  }
                >
                  {p.assets
                    .filter((a) => a.kind === "image")
                    .map((a, i) => (
                      <option key={a.id} value={a.id}>
                        사진 {i + 1} · {a.filename}
                      </option>
                    ))}
                </select>
              </label>
              <div className="full ai-video-panel">
                <h3>
                  <Sparkles size={18} /> 사진으로 AI 영상 만들기
                </h3>
                <p className="help">
                  사진을 바탕으로 5초짜리 움직이는 장면을 생성합니다. 사진과
                  설명이 Runway로 전송되며 생성·재생성 시 크레딧이 사용됩니다.
                </p>
                <label>
                  원하는 움직임
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={scene.videoPrompt || ""}
                    placeholder="예: 상품은 그대로 두고 카메라가 천천히 다가가며, 부드러운 햇빛과 그림자가 움직입니다."
                    onChange={(e) => patch({ videoPrompt: e.target.value })}
                  />
                  <small>
                    비워두면 부드러운 카메라 이동을 적용합니다. 상품 모양과 인쇄
                    문구는 생성 후 확인해 주세요.
                  </small>
                </label>
                {!videoHealth.data?.video?.enabled && (
                  <p className="help">
                    영상 생성 연결이 필요합니다. 스튜디오 설정의 ‘AI 영상 생성
                    연결’ 안내를 확인하세요.
                  </p>
                )}
                <button
                  type="button"
                  disabled={locked || !videoHealth.data?.video?.enabled}
                  onClick={() =>
                    void run(async () => {
                      await flush();
                      await api(
                        `/projects/${p.id}/scenes/${encodeURIComponent(scene.id)}/video`,
                        send("POST", { revision: revision.current }),
                      );
                    }, "AI 영상 생성을 시작했습니다.")
                  }
                >
                  <Sparkles size={16} />{" "}
                  {scene.videoAssetId
                    ? "AI 영상 새로 생성 (유료)"
                    : "AI 영상 생성 (유료)"}
                </button>
                {p.assets.some((a) => a.kind === "video") && (
                  <label>
                    장면에 사용할 영상
                    <select
                      value={scene.videoAssetId || ""}
                      onChange={(e) =>
                        patch({ videoAssetId: e.target.value || null })
                      }
                    >
                      <option value="">사진 편집 사용</option>
                      {p.assets
                        .filter((a) => a.kind === "video")
                        .map((a, i) => (
                          <option key={a.id} value={a.id}>
                            생성 영상 {i + 1} · {a.filename}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {scene.videoAssetId &&
                  p.assets.find((a) => a.id === scene.videoAssetId) && (
                    <>
                      <video
                        className="ai-clip-preview"
                        key={scene.videoAssetId}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        src={
                          p.assets.find((a) => a.id === scene.videoAssetId)!.url
                        }
                      />
                      <small>
                        생성 영상이 미리보기와 최종 쇼츠에 적용됩니다. 5초보다
                        긴 장면은 반복 재생합니다. 움직임 설명을 바꾼 뒤에는
                        새로 생성해 주세요.
                      </small>
                    </>
                  )}
              </div>
              <label>
                장면 길이 (초)
                <input
                  type="number"
                  min="1"
                  max={board.durationSec}
                  step="0.1"
                  value={Math.round(scene.durationFrames / 3) / 10}
                  onChange={(e) => {
                    const frames = Math.max(
                      30,
                      Math.min(900, Math.round(Number(e.target.value) * 30)),
                    );
                    change({
                      ...board,
                      scenes: setSceneDuration(
                        board.scenes,
                        selected,
                        frames,
                        board.durationSec,
                      ),
                    });
                  }}
                />
                <small>전체 길이에 맞춰 다른 장면과 자동 조정</small>
              </label>
              <label>
                레이아웃
                <select
                  value={scene.layout}
                  onChange={(e) =>
                    patch({ layout: e.target.value as Scene["layout"] })
                  }
                >
                  {layouts.map((l) => (
                    <option key={l} value={l}>
                      {layoutLabels[l]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                이미지 움직임
                <select
                  disabled={!!scene.videoAssetId}
                  value={scene.motion.type}
                  onChange={(e) =>
                    patch({
                      motion: {
                        ...scene.motion,
                        type: e.target.value as Scene["motion"]["type"],
                      },
                    })
                  }
                >
                  {motionNames.map((m) => (
                    <option key={m} value={m}>
                      {motionLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시작 전환
                <select
                  value={scene.transitionIn}
                  onChange={(e) =>
                    patch({
                      transitionIn: e.target.value as Scene["transitionIn"],
                    })
                  }
                >
                  {transitions.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                끝 전환
                <select
                  value={scene.transitionOut}
                  onChange={(e) =>
                    patch({
                      transitionOut: e.target.value as Scene["transitionOut"],
                    })
                  }
                >
                  {transitions.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                가로 초점 · {Math.round(scene.focalPoint.x * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scene.focalPoint.x}
                  onChange={(e) =>
                    patch({
                      focalPoint: {
                        ...scene.focalPoint,
                        x: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                세로 초점 · {Math.round(scene.focalPoint.y * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scene.focalPoint.y}
                  onChange={(e) =>
                    patch({
                      focalPoint: {
                        ...scene.focalPoint,
                        y: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                사진 맞춤
                <select
                  value={scene.fit}
                  onChange={(e) =>
                    patch({ fit: e.target.value as Scene["fit"] })
                  }
                >
                  <option value="contain">전체 상품 보존 (권장)</option>
                  <option value="cover">전체 이미지 레이아웃에서 크롭</option>
                </select>
              </label>
              <label>
                움직임 강도
                <input
                  type="range"
                  min="0"
                  max="0.12"
                  step="0.01"
                  value={scene.motion.strength}
                  onChange={(e) =>
                    patch({
                      motion: {
                        ...scene.motion,
                        strength: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="full">
                내레이션 원고
                <textarea
                  disabled={board.style.narrationSource === "caption"}
                  maxLength={300}
                  rows={2}
                  value={
                    board.style.narrationSource === "caption"
                      ? scene.caption
                      : scene.voiceover
                  }
                  onChange={(e) => patch({ voiceover: e.target.value })}
                />
                {board.style.narrationSource === "caption" && (
                  <small>
                    현재 자막을 자동으로 읽습니다. 자막을 수정하면 내레이션에도
                    반영됩니다.
                  </small>
                )}
              </label>
            </div>
          </fieldset>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>장면 타임라인</h2>
          <small>드래그 또는 화살표로 순서를 바꿔요</small>
        </div>
        <div className="timeline">
          {board.scenes.map((s, i) => (
            <div
              key={s.id}
              className={"timeline-card " + (selected === i ? "selected" : "")}
              draggable={!locked}
              onDragStart={(e) =>
                e.dataTransfer.setData("text/plain", String(i))
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!locked)
                  reorder(Number(e.dataTransfer.getData("text/plain")), i);
              }}
            >
              <button onClick={() => setSelected(i)}>
                <div className="timeline-image">
                  <img
                    src={p.assets.find((a) => a.id === s.assetId)?.url}
                    alt={`장면 ${i + 1}`}
                  />
                  <span>{(s.durationFrames / 30).toFixed(1)}초</span>
                </div>
                <div>
                  <b>
                    <GripVertical size={12} />
                    장면 {i + 1}
                  </b>
                  <p>{s.caption}</p>
                </div>
              </button>
              <div className="timeline-controls">
                <button
                  className="icon"
                  aria-label={`장면 ${i + 1} 앞으로`}
                  disabled={locked || i === 0}
                  onClick={() => reorder(i, i - 1)}
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={`장면 ${i + 1} 뒤로`}
                  disabled={locked || i === board.scenes.length - 1}
                  onClick={() => reorder(i, i + 1)}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>첫 2초, 시선을 붙잡는 한마디</h2>
        <div className="hook-options">
          {board.hookCandidates.map((h, i) => (
            <button
              key={i}
              disabled={locked}
              className={board.hook === h ? "selected" : ""}
              onClick={() => {
                const scenes = [...board.scenes];
                scenes[0] = { ...scenes[0], caption: h, voiceover: h };
                change({ ...board, hook: h, scenes });
              }}
            >
              <span>0{i + 1}</span>
              {h}
            </button>
          ))}
        </div>
        <details>
          <summary>전체 스타일과 가격·CTA 수정</summary>
          <fieldset disabled={locked}>
            <div className="form-grid">
              <label>
                컨셉
                <select
                  value={board.conceptId}
                  onChange={(e) => {
                    const preset = presets.find(
                      (p) => p.id === e.target.value,
                    )!;
                    change({
                      ...board,
                      conceptId: preset.id,
                      style: {
                        ...board.style,
                        pace: preset.pace,
                        captionStyle: preset.fontStyle,
                      },
                      scenes: board.scenes.map((s, i) => ({
                        ...s,
                        motion: {
                          ...s.motion,
                          type: preset.motionSet[i % preset.motionSet.length],
                        },
                        transitionIn:
                          preset.transitionSet[i % preset.transitionSet.length],
                      })),
                    });
                  }}
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                전체 영상 길이
                <select
                  value={board.durationSec}
                  onChange={(e) =>
                    change({
                      ...board,
                      durationSec: Number(
                        e.target.value,
                      ) as Board["durationSec"],
                      scenes: normalizeScenes(
                        board.scenes,
                        Number(e.target.value),
                      ),
                    })
                  }
                >
                  {[15, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n}초
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                CTA
                <input
                  value={board.outro.cta}
                  maxLength={80}
                  onChange={(e) =>
                    change({
                      ...board,
                      outro: { ...board.outro, cta: e.target.value },
                      scenes: board.scenes.map((s) =>
                        s.layout === "endcard"
                          ? {
                              ...s,
                              caption: e.target.value,
                              voiceover: e.target.value,
                            }
                          : s,
                      ),
                    })
                  }
                />
              </label>
            </div>
            <StyleFields
              value={board.style}
              onChange={(style) => change({ ...board, style })}
            />
          </fieldset>
        </details>
      </section>
    </>
  );
}

function Results({ project: p }: { project: Project }) {
  return p.outputs.length ? (
    <div className="results-grid">
      {[...p.outputs].reverse().map((o) => (
        <section className="panel result-card" key={o.id}>
          <div>
            <video
              controls
              preload="metadata"
              poster={o.downloads.thumbnail}
              src={o.downloads.video}
              aria-label={`변형 ${o.variant} 완성 영상`}
            />
          </div>
          <div>
            <span className="pill">
              <Check size={14} />
              검증 완료
            </span>
            <h2>변형 {o.variant}</h2>
            <p>
              {o.verification.width} × {o.verification.height}
              <br />
              {o.verification.duration.toFixed(1)}초 · H.264 / AAC ·{" "}
              {o.verification.fps}fps
            </p>
            {o.verification.narration === "script_fallback" && (
              <div className="alert">
                TTS 키가 없어 내레이션은 대본으로 제공됩니다.
              </div>
            )}
            {o.verification.narration === "ai" && (
              <p>
                자동 내레이션 포함 ·{" "}
                {o.verification.narrationSource === "caption"
                  ? "자막 읽기"
                  : "원고 읽기"}
              </p>
            )}
            {o.verification.music && (
              <p>
                배경음악{" "}
                {o.verification.music === "none" ||
                o.verification.musicVolume === 0
                  ? "없음"
                  : "포함"}
              </p>
            )}
            <div className="downloads">
              {Object.entries({
                video: "MP4 영상",
                thumbnail: "썸네일 PNG",
                subtitles: "SRT 자막",
                script: "내레이션 대본",
                metadata: "프로젝트 JSON",
              }).map(([k, l]) => (
                <a
                  className={"button " + (k === "video" ? "primary" : "")}
                  download
                  href={o.downloads[k]}
                  key={k}
                >
                  <Download size={17} />
                  {l}
                </a>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  ) : (
    <div className="empty">
      <Film size={40} />
      <h2>
        {busyJob(p) ? "쇼츠를 만들고 있어요" : "아직 완성된 영상이 없어요"}
      </h2>
      <p>{busyJob(p)?.kind === "auto_video"
        ? "전체 사진의 영상 생성과 편집이 끝나면 여기에 완성 영상이 나타납니다. 추가로 누를 버튼은 없어요."
        : busyJob(p) ? "완료되면 이 화면에서 영상을 확인하고 저장할 수 있어요."
        : "스토리보드를 확인한 뒤 영상 렌더링을 눌러 주세요."}</p>
    </div>
  );
}

function PresetManager({
  presets,
  run,
  ask,
}: {
  presets: Preset[];
  run: Run;
  ask: Ask;
}) {
  const [selected, setSelected] = useState(presets[0]?.id || ""),
    [draft, setDraft] = useState(""),
    [jsonError, setJsonError] = useState(""),
    [isNew, setIsNew] = useState(false);
  const preset = presets.find((p) => p.id === selected);
  useEffect(() => {
    if (preset && !isNew)
      setDraft(JSON.stringify(stripBuiltin(preset), null, 2));
  }, [preset, isNew]);
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">A MOOD FOR EVERY STORY</div>
          <h1>컨셉 라이브러리</h1>
          <p>상품마다 다른 매력, 목적에 맞는 컨셉을 찾아보세요.</p>
        </div>
        <div className="actions">
          <a className="button" href="/api/presets/export/json" download>
            <Download size={16} />
            내보내기
          </a>
          <label className="button">
            <Upload size={16} />
            JSON 가져오기
            <input
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    if (f.size > 1024 * 1024)
                      throw new Error("JSON 파일은 1MB 이하로 선택하세요.");
                    const parsed = JSON.parse(await f.text());
                    await api(
                      "/presets/import",
                      send("POST", Array.isArray(parsed) ? parsed : [parsed]),
                    );
                  }, "프리셋을 가져왔습니다.");
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="primary"
            onClick={() => {
              const base = stripBuiltin(presets[0]);
              setIsNew(true);
              setDraft(
                JSON.stringify(
                  { ...base, id: "custom_" + Date.now(), name: "나의 새 컨셉" },
                  null,
                  2,
                ),
              );
            }}
          >
            새 프리셋
          </button>
        </div>
      </div>
      <section className="panel">
        <ConceptPicker
          presets={presets}
          value={selected}
          onChange={(p) => {
            setSelected(p.id);
            setIsNew(false);
          }}
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{isNew ? "새 프리셋" : preset?.name}</h2>
            <p>{preset?.description}</p>
          </div>
          {preset && !isNew && (
            <div className="actions">
              <button
                onClick={() =>
                  void run(async () => {
                    const p = await api<Preset>(
                      `/presets/${preset.id}/duplicate`,
                      send("POST"),
                    );
                    setSelected(p.id);
                  }, "복제했습니다. 아래에서 편집하세요.")
                }
              >
                <Copy size={16} />
                복제
              </button>
              {!preset.builtin && (
                <button
                  className="danger"
                  onClick={() =>
                    ask("이 사용자 프리셋을 삭제할까요?", () =>
                      api(`/presets/${preset.id}`, send("DELETE")),
                    )
                  }
                >
                  <Trash2 size={16} />
                  삭제
                </button>
              )}
            </div>
          )}
        </div>
        <p className="help">
          {preset?.builtin && !isNew
            ? "기본 프리셋은 복제해서 나만의 버전으로 편집할 수 있어요."
            : "색상, 리듬, 문구 패턴을 변경한 후 저장하세요. 모든 항목은 서버 스키마로 검증합니다."}
        </p>
        <PresetFields
          text={draft}
          onChange={setDraft}
          disabled={!!preset?.builtin && !isNew}
        />
        <details>
          <summary>고급 설정 · JSON 편집</summary>
          <label>
            프리셋 JSON
            <textarea
              className="code-editor"
              rows={20}
              value={draft}
              readOnly={!!preset?.builtin && !isNew}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
        </details>
        {jsonError && <div className="alert error">{jsonError}</div>}
        {(!preset?.builtin || isNew) && (
          <button
            className="primary"
            onClick={() => {
              setJsonError("");
              try {
                const data = JSON.parse(draft);
                void run(async () => {
                  const p = await api<Preset>(
                    isNew ? "/presets" : `/presets/${selected}`,
                    send(isNew ? "POST" : "PUT", data),
                  );
                  setSelected(p.id);
                  setIsNew(false);
                }, "프리셋을 저장했습니다.");
              } catch {
                setJsonError("JSON 문법을 확인해 주세요.");
              }
            }}
          >
            프리셋 저장
          </button>
        )}
      </section>
    </>
  );
}

function SettingsPage({ run, ask }: { run: Run; ask: Ask }) {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api("/settings"),
  });
  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (query.data) setForm(query.data.defaults);
  }, [query.data]);
  if (!form) return <div className="empty">설정을 불러오고 있어요.</div>;
  return (
    <>
      <div className="heading">
        <div className="eyebrow">MAKE IT YOURS</div>
        <h1>스튜디오 설정</h1>
      </div>
      <DesktopSettings />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api("/settings", send("PUT", form)),
            "기본 설정을 저장했습니다.",
          );
        }}
      >
        <section className="panel">
          <h2>우리 브랜드 기본값</h2>
          <div className="form-grid">
            <label>
              광고 판매처 이름
              <input
                maxLength={80}
                value={form.storeName || ""}
                onChange={(e) =>
                  setForm({ ...form, storeName: e.target.value })
                }
                placeholder="주아상사"
              />
            </label>
            <label>
              판매처 주소
              <input
                type="url"
                maxLength={300}
                value={form.storeUrl || ""}
                onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
                placeholder="https://smartstore.naver.com/jua"
              />
            </label>
            <label>
              브랜드 이름
              <input
                maxLength={80}
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </label>
            <label>
              브랜드 색상
              <input
                type="color"
                value={form.brandColor}
                onChange={(e) =>
                  setForm({ ...form, brandColor: e.target.value })
                }
              />
            </label>
            <label className="full">
              기본 CTA
              <input
                maxLength={80}
                value={form.cta}
                onChange={(e) => setForm({ ...form, cta: e.target.value })}
              />
            </label>
            <label>
              파일 보관 기간 (일)
              <input
                type="number"
                min="1"
                max="3650"
                value={form.retentionDays}
                onChange={(e) =>
                  setForm({ ...form, retentionDays: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p className="help">
            새 프로젝트에 적용됩니다. 프로젝트별로 로고를 교체할 수 있습니다.
            보관 기간은 정리 명령에 적용되며 자동으로 프로젝트를 삭제하지
            않습니다.
          </p>
          <button className="primary" type="submit">
            기본 설정 저장
          </button>
        </section>
      </form>
      <section className="panel">
        <h2>기본 브랜드 로고</h2>
        <p className="help">
          새 프로젝트에 자동으로 복사됩니다. JPG, PNG, WebP를 사용할 수 있어요.
        </p>
        <div className="actions">
          {query.data.logoUrl && (
            <>
              <img
                src={query.data.logoUrl}
                alt="기본 브랜드 로고"
                style={{ width: 100, height: 80, objectFit: "contain" }}
              />
              <button
                onClick={() =>
                  ask(
                    "기본 로고를 삭제할까요? 기존 프로젝트의 로고는 유지됩니다.",
                    () => api("/settings/logo", send("DELETE")),
                  )
                }
              >
                로고 삭제
              </button>
            </>
          )}
          <label className="button">
            <Upload size={16} />
            로고 선택
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    const body = new FormData();
                    body.append("file", file);
                    await api("/settings/logo", { method: "POST", body });
                  }, "기본 로고를 저장했습니다.");
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      <section className="panel">
        <h2>연결과 저장 공간</h2>
        <dl className="settings-list">
          <dt>현재 모드</dt>
          <dd>{query.data.provider.mode === "ai" ? "AI 연결" : "데모 모드"}</dd>
          <dt>AI 공급자 / 모델</dt>
          <dd>
            {query.data.provider.provider} / {query.data.provider.model}
          </dd>
          <dt>저장 경로</dt>
          <dd>
            <code>{query.data.storagePath}</code>
          </dd>
          <dt>공간 한도</dt>
          <dd>{query.data.storageLimitMb}MB</dd>
        </dl>
        {!window.paperDesktop && <div className="info-box">
          <h3>AI 영상 생성 연결</h3>
          <p>
            서버의 <code>.env</code>에 <code>RUNWAY_API_KEY</code>를 설정하고
            API와 worker를 재시작하세요. Runway 개발자 계정과 크레딧이
            필요합니다. 연결 후 스토리보드의 각 장면에서 영상을 생성할 수
            있습니다.
          </p>
          <p>
            생성 모델: Gen-4 Turbo · 5초 · 세로 영상. 생성된 클립은 저장되며,
            최종 쇼츠를 다시 렌더링할 때는 재생성하지 않습니다.
          </p>
        </div>}
        {!window.paperDesktop && <div className="info-box">
          <h3>실제 AI 분석·음성 연결</h3>
          <p>
            서버의 <code>.env</code>에서 <code>AI_PROVIDER=anthropic</code>,{" "}
            <code>AI_API_KEY</code>, <code>AI_MODEL</code>을 설정하고 API와
            worker를 재시작하세요. 음성은 기존 <code>RUNWAY_API_KEY</code>로도
            생성할 수 있습니다. 별도 ElevenLabs 연결은 <code>TTS_API_KEY</code>
            와 <code>TTS_VOICE_ID</code>를 설정하면 우선 사용합니다.
          </p>
          <p>
            키는 서버에만 보관됩니다. Runway 음성은 Multilingual v2의 Rachel
            목소리로 생성합니다. 음성 연결이 없으면 자동 내레이션 렌더 전에
            설정을 안내합니다. 음악만 사용하는 영상은 키 없이 만들 수 있어요.
          </p>
        </div>}
        <a
          className="button"
          href="/api/ready"
          target="_blank"
          rel="noreferrer"
        >
          실행 상태 확인 <ArrowRight size={15} />
        </a>
      </section>
    </>
  );
}
