import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoVideoPanel } from "../apps/web/src/AutoVideoPanel";
import { JobStatus } from "../apps/web/src/App";
import type { Asset } from "../packages/shared-schema";

afterEach(() => vi.unstubAllGlobals());
const project = {
  id: "p",
  revision: 3,
  board: {},
  assets: [
    { id: "a", kind: "image", url: "/a.jpg", filename: "a.jpg" },
    { id: "b", kind: "image", url: "/b.jpg", filename: "b.jpg" },
  ] as Asset[],
};

describe("All-photo automatic edit", () => {
  it("explains a missing connection and enables generation after rechecking", async () => {
    let connected = false;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/health")
              ? { video: { enabled: connected } }
              : { photos: [] },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AutoVideoPanel
          project={project}
          disabled={false}
          run={async (action) => {
            await action();
          }}
          onStart={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(
        "Runway API 키가 연결되지 않아 AI 영상 생성을 시작할 수 없습니다.",
      ),
    ).toBeInTheDocument();
    const start = screen.getByRole("button", {
      name: "전체 사진으로 숏츠 완성하기 (유료)",
    });
    expect(start).toBeDisabled();
    expect(
      screen.getByText(
        /설치형 앱에 저장한 키는 웹 실행에 자동으로 적용되지 않습니다/,
      ),
    ).toBeInTheDocument();
    connected = true;
    fireEvent.click(
      screen.getByRole("button", { name: "연결·사진 다시 확인" }),
    );
    await waitFor(() => expect(start).toBeEnabled());
    expect(
      fetcher.mock.calls.every(([url]) => !url.endsWith("/auto-video")),
    ).toBe(true);
    client.clear();
  });

  it("distinguishes a server error from a missing API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/health")
          ? new Response(JSON.stringify({ error: { message: "offline" } }), {
              status: 503,
            })
          : new Response(JSON.stringify({ photos: [] })),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AutoVideoPanel
          project={project}
          disabled={false}
          run={async (action) => {
            await action();
          }}
          onStart={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(/서버 연결 상태를 확인하지 못했습니다/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Runway API 키가 연결되지 않아/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "전체 사진으로 숏츠 완성하기 (유료)",
      }),
    ).toBeDisabled();
    client.clear();
  });

  it("shows reuse, saves pending edits, and starts one job with the selected narration", async () => {
    const events: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/health"))
        return new Response(JSON.stringify({ video: { enabled: true } }));
      if (url.endsWith("/plan"))
        return new Response(
          JSON.stringify({
            photos: [
              { assetId: "a", filename: "a.jpg", status: "completed" },
              { assetId: "b", filename: "b.jpg", status: "pending" },
            ],
            prompt: "자연광 아래에서 한 손이 노트 표지를 천천히 연다.",
          }),
        );
      events.push("start");
      expect(JSON.parse(init?.body as string)).toEqual({
        revision: 4,
        narration: true,
        useCurrentEdit: true,
      });
      return new Response(JSON.stringify({ id: "job" }));
    });
    vi.stubGlobal("fetch", fetcher);
    const onStart = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AutoVideoPanel
          project={project}
          disabled={false}
          run={async (action) => {
            await action();
          }}
          beforeStart={async () => {
            events.push("saved");
            return 4;
          }}
          onStart={onStart}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/새로 생성 1개/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("자동으로 들어가는 명령어 보기"));
    expect(
      screen.getByText("자연광 아래에서 한 손이 노트 표지를 천천히 연다."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "전체 사진으로 숏츠 완성하기 (유료)",
      }),
    );
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(events).toEqual(["saved", "start"]);
    client.clear();
  });

  it("shows per-photo progress and allows cancellation", () => {
    const cancel = vi.fn();
    render(
      <JobStatus
        job={{
          id: "job",
          kind: "auto_video",
          status: "images",
          phase: "clips",
          progress: 35,
          attempt: 1,
          error: null,
          error_code: null,
          created_at: "",
          photos: [
            { assetId: "a", filename: "a.jpg", status: "completed" },
            { assetId: "b", filename: "b.jpg", status: "processing" },
          ],
        }}
        onCancel={cancel}
      />,
    );
    expect(screen.getByText(/영상 준비 1 \/ 2장/)).toBeInTheDocument();
    expect(screen.getByText("생성 중")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
