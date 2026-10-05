/**
 * Stream-drop recovery behavior of useChat's consumeStream loop.
 *
 * A long-running turn can outlive a single HTTP connection: a proxy or load
 * balancer may kill the socket mid-run while the run keeps executing
 * server-side. That kill surfaces in the browser either as a clean stream end
 * without a terminal frame, or as a rejected read() (TypeError "network
 * error"). Both must reattach through adapter.getExecutionStream instead of
 * dead-ending the message bubble.
 *
 * The encoding/streams globals jsdom lacks are provided by jest.setup.cjs.
 */
import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { ChatProvider } from "../context/chat-provider";
import { useChat, ChatStateProvider } from "./use-chat";
import type { ChatAdapter } from "../types/adapter";

type GetExecutionStream = NonNullable<ChatAdapter["getExecutionStream"]>;

const encoder = new TextEncoder();

function sseFrame(data: object | string, event?: string): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return encoder.encode(`${event ? `event: ${event}\n` : ""}data: ${payload}\n\n`);
}

/**
 * Build an SSE byte stream from pre-encoded frames. With `failAfter`, the
 * stream errors after the frames are consumed — the shape of a socket killed
 * mid-run (read() rejects). Without it, the stream ends cleanly.
 */
function streamOf(chunks: Uint8Array[], opts?: { failAfter?: Error }): ReadableStream<Uint8Array> {
  let next = 0;
  return new ReadableStream<Uint8Array>({
    // Deliver one chunk per read; erroring in start() would discard the queued
    // chunks, but a real socket kill happens after earlier frames were read.
    pull(controller) {
      const chunk = chunks[next];
      if (chunk) {
        next += 1;
        controller.enqueue(chunk);
        return;
      }
      if (opts?.failAfter) {
        controller.error(opts.failAfter);
      } else {
        controller.close();
      }
    },
  });
}

const startedFrame = sseFrame({ executionId: "exec-1" }, "started");
const doneFrame = sseFrame({ event: "done", isComplete: true });

function makeAdapter(overrides: Partial<ChatAdapter>): ChatAdapter {
  return {
    createSession: jest.fn(async () => "session-1"),
    loadSession: jest.fn(),
    listSessions: jest.fn(async () => ({ sessions: [], total: 0, page: 1 })),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    sendMessage: jest.fn(),
    ...overrides,
  } as unknown as ChatAdapter;
}

function renderChat(adapter: ChatAdapter) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ChatProvider adapter={adapter} organizationId="org-1">
      {children}
    </ChatProvider>
  );
  return renderHook(() => useChat(), { wrapper });
}

function lastAssistantMessage(result: { current: ReturnType<typeof useChat> }) {
  const assistants = result.current.messages.filter((m) => m.role === "assistant");
  return assistants[assistants.length - 1];
}

describe("useChat stream-drop recovery", () => {
  it("reattaches via getExecutionStream when the read() rejects mid-stream", async () => {
    const getExecutionStream = jest.fn<GetExecutionStream>(async () =>
      streamOf([startedFrame, sseFrame({ content: "Full answer", isComplete: false }), doneFrame]),
    );
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame, sseFrame({ content: "partial", isComplete: false })], {
          failAfter: new TypeError("network error"),
        }),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("run the long audit");
    });

    expect(getExecutionStream).toHaveBeenCalledTimes(1);
    expect(getExecutionStream).toHaveBeenCalledWith("exec-1", 0, expect.anything());

    const assistant = lastAssistantMessage(result);
    // Replay re-sends the whole turn, so the bubble holds the replayed content
    // — not the pre-drop partial, and no error.
    expect(assistant?.content).toBe("Full answer");
    expect(assistant?.error).toBeUndefined();
    expect(assistant?.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("reattaches via getExecutionStream when the stream ends cleanly without a terminal frame", async () => {
    const getExecutionStream = jest.fn<GetExecutionStream>(async () =>
      streamOf([startedFrame, sseFrame({ content: "Recovered", isComplete: false }), doneFrame]),
    );
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame, sseFrame({ content: "partial", isComplete: false })]),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(getExecutionStream).toHaveBeenCalledTimes(1);
    const assistant = lastAssistantMessage(result);
    expect(assistant?.content).toBe("Recovered");
    expect(assistant?.error).toBeUndefined();
    expect(assistant?.isStreaming).toBe(false);
  });

  it("settles with the dropped-connection message (not the raw network error) when the adapter cannot reconnect", async () => {
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame, sseFrame({ content: "partial", isComplete: false })], {
          failAfter: new TypeError("network error"),
        }),
      ),
      // no getExecutionStream
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    const assistant = lastAssistantMessage(result);
    expect(assistant?.error).toBe(
      "The connection was lost before the response finished. Retry to continue.",
    );
    expect(assistant?.error).not.toContain("network error");
    expect(assistant?.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("settles dropped when the connection dies before the started frame delivered an execution id", async () => {
    const getExecutionStream = jest.fn<GetExecutionStream>();
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([sseFrame({ content: "partial", isComplete: false })], {
          failAfter: new TypeError("network error"),
        }),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(getExecutionStream).not.toHaveBeenCalled();
    const assistant = lastAssistantMessage(result);
    expect(assistant?.error).toBe(
      "The connection was lost before the response finished. Retry to continue.",
    );
  });

  it("does not reconnect when the stream ends with a terminal frame", async () => {
    const getExecutionStream = jest.fn<GetExecutionStream>();
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame, sseFrame({ content: "All done", isComplete: false }), doneFrame]),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(getExecutionStream).not.toHaveBeenCalled();
    const assistant = lastAssistantMessage(result);
    expect(assistant?.content).toBe("All done");
    expect(assistant?.error).toBeUndefined();
  });

  it("gives up after the reconnected stream also drops repeatedly (bounded reconnects)", async () => {
    // Every reattached stream also dies without a terminal frame — the loop
    // must stop at its bound and surface the dropped-connection error instead
    // of spinning forever.
    const getExecutionStream = jest.fn<GetExecutionStream>(async () =>
      streamOf([startedFrame, sseFrame({ content: "still going", isComplete: false })], {
        failAfter: new TypeError("network error"),
      }),
    );
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame], { failAfter: new TypeError("network error") }),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(getExecutionStream).toHaveBeenCalledTimes(5);
    const assistant = lastAssistantMessage(result);
    expect(assistant?.error).toBe(
      "The connection was lost before the response finished. Retry to continue.",
    );
    expect(assistant?.isStreaming).toBe(false);
  });
});

describe("useChat cancellation", () => {
  // The runner ends a stopped run with a `status`/`canceled` frame rather than an
  // `error` frame. Before this was recognized, the stream looked like it ended with
  // no terminal frame, so a stop was reported to the user as a lost connection.
  const canceledFrame = sseFrame({
    type: "status",
    payload: { status: "Stopped", state: "canceled" },
  });

  it("settles a canceled run as stopped, with no error and no reconnect", async () => {
    const getExecutionStream = jest.fn<GetExecutionStream>();
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([
          startedFrame,
          sseFrame({ content: "partial", isComplete: false }),
          canceledFrame,
        ]),
      ),
      getExecutionStream,
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("list my portfolios");
    });

    expect(getExecutionStream).not.toHaveBeenCalled();
    const assistant = lastAssistantMessage(result);
    expect(assistant?.error).toBeUndefined();
    expect(assistant?.stoppedByUser).toBe(true);
    expect(assistant?.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not mark a normally completed run as stopped", async () => {
    const adapter = makeAdapter({
      sendMessage: jest.fn(async () =>
        streamOf([startedFrame, sseFrame({ content: "All done", isComplete: false }), doneFrame]),
      ),
    } as Partial<ChatAdapter>);

    const { result } = renderChat(adapter);
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    const assistant = lastAssistantMessage(result);
    expect(assistant?.stoppedByUser).toBeUndefined();
    expect(assistant?.error).toBeUndefined();
  });
});

describe("useChat artifacts lifecycle", () => {
  it("clears artifacts when loadSession or clearMessages is called", async () => {
    const onArtifactsReady = jest.fn();
    const onClearArtifacts = jest.fn();
    const adapter = makeAdapter({});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatProvider adapter={adapter} organizationId="org-1">
        <ChatStateProvider onArtifactsReady={onArtifactsReady} onClearArtifacts={onClearArtifacts}>
          {children}
        </ChatStateProvider>
      </ChatProvider>
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.loadSession({
        sessionId: "sess-1",
        title: "Session 1",
        updatedAt: "2026-08-12T00:00:00Z",
        messages: [],
        artifacts: [
          {
            artifactId: "art-1",
            title: "Spec 1",
            type: "agent-spec",
            content: "{}",
            exportFormats: ["markdown"],
          },
        ],
      });
    });

    expect(onClearArtifacts).toHaveBeenCalledTimes(1);
    expect(onArtifactsReady).toHaveBeenCalledWith([
      {
        artifactId: "art-1",
        title: "Spec 1",
        type: "agent-spec",
        content: "{}",
        exportFormats: ["markdown"],
      },
    ]);

    act(() => {
      result.current.clearMessages();
    });

    expect(onClearArtifacts).toHaveBeenCalledTimes(2);
  });
});

describe("useChat session loading (Wave 4)", () => {
  it("tracks isSessionLoading state during switchSession", async () => {
    let resolveLoad: ((val: any) => void) | null = null;
    const adapter = makeAdapter({
      loadSession: jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      }) as any,
    });

    const { result } = renderChat(adapter);
    expect(result.current.isSessionLoading).toBe(false);

    let switchPromise: Promise<any>;
    act(() => {
      switchPromise = result.current.switchSession!("sess-delayed");
    });

    expect(result.current.isSessionLoading).toBe(true);
    expect(adapter.loadSession).toHaveBeenCalledWith("sess-delayed");

    await act(async () => {
      resolveLoad!({
        sessionId: "sess-delayed",
        title: "Loaded Session",
        updatedAt: "2026-10-02T00:00:00Z",
        messages: [],
      });
      await switchPromise;
    });

    expect(result.current.isSessionLoading).toBe(false);
    expect(result.current.currentSessionId).toBe("sess-delayed");
  });
});

describe("useChat step progression & status events (Wave 3)", () => {
  it("creates reasoning steps from simple status events and transitions them to done", async () => {
    const stream = streamOf([
      startedFrame,
      sseFrame({ type: "status", label: "Searching documents..." }),
      sseFrame({ type: "status", label: "Analyzing results..." }),
      sseFrame({ content: "Here are the results" }),
      doneFrame,
    ]);

    const adapter = makeAdapter({
      sendMessage: jest.fn(async () => stream),
    });

    const { result } = renderChat(adapter);

    await act(async () => {
      await result.current.sendMessage("Find docs");
    });

    const assistant = lastAssistantMessage(result);
    expect(assistant).toBeDefined();
    expect(assistant?.steps).toHaveLength(2);
    expect(assistant?.steps?.[0]?.status).toBe("done");
    expect(assistant?.steps?.[0]?.label).toBe("Searching documents...");
    expect(assistant?.steps?.[1]?.status).toBe("done");
    expect(assistant?.steps?.[1]?.label).toBe("Analyzing results...");
  });
});

describe("useChat streaming source stripper (Wave 3)", () => {
  it("strips trailing [source: ...] tags and populates sources", async () => {
    const stream = streamOf([
      startedFrame,
      sseFrame({ content: "According to policy, " }),
      sseFrame({ content: "remote work is permitted. [" }),
      sseFrame({ content: 'source: Handbook.pdf, tags: HR, citation: "2 days WFH"]' }),
      doneFrame,
    ]);

    const adapter = makeAdapter({
      sendMessage: jest.fn(async () => stream),
    });

    const { result } = renderChat(adapter);

    await act(async () => {
      await result.current.sendMessage("What is the WFH policy?");
    });

    const assistant = lastAssistantMessage(result);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe("According to policy, remote work is permitted.");
    expect(assistant?.sources).toHaveLength(1);
    expect(assistant?.sources?.[0]?.title).toBe("Handbook.pdf");
    expect(assistant?.sources?.[0]?.snippet).toBe("2 days WFH");
  });
});
