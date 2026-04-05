import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import * as actions from "@/actions";
import * as anonTracker from "@/lib/anon-work-tracker";
import * as getProjectsModule from "@/actions/get-projects";
import * as createProjectModule from "@/actions/create-project";

// モック設定
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト: 匿名作業なし、既存プロジェクトなし
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectModule.createProject).mockResolvedValue({
      id: "new-project-id",
      name: "New Design",
      userId: "user-1",
      messages: "[]",
      data: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────

  test("初期状態では isLoading が false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("signIn と signUp 関数が返される", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });

  // ─── signIn ─────────────────────────────────────────────────

  describe("signIn", () => {
    test("失敗時は result を返し、ルーティングしない", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signIn("bad@example.com", "wrongpass");
      });

      expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("成功・匿名作業なし・既存プロジェクトあり → 最新プロジェクトへ遷移", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        { id: "proj-1", name: "My Design", createdAt: new Date(), updatedAt: new Date() },
        { id: "proj-2", name: "Old Design", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-1");
      expect(createProjectModule.createProject).not.toHaveBeenCalled();
    });

    test("成功・匿名作業なし・既存プロジェクトなし → 新規プロジェクト作成して遷移", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/new-project-id");
    });

    test("成功・匿名作業あり → 匿名データでプロジェクト作成して遷移", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "Hello" }],
        fileSystemData: { "/app.tsx": { type: "file", content: "export default () => <div/>" } },
      });
      vi.mocked(createProjectModule.createProject).mockResolvedValue({
        id: "anon-project-id",
        name: "Design from ...",
        userId: "user-1",
        messages: "[]",
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "Hello" }],
          data: { "/app.tsx": { type: "file", content: "export default () => <div/>" } },
        })
      );
      expect(anonTracker.clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
      // 既存プロジェクト検索は行わない
      expect(getProjectsModule.getProjects).not.toHaveBeenCalled();
    });

    test("匿名データが存在するが messages が空 → getProjects フローへ", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [],
        fileSystemData: {},
      });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        { id: "proj-existing", name: "Existing", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(anonTracker.clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-existing");
    });

    test("処理中は isLoading が true になり、完了後 false に戻る", async () => {
      let resolveSignIn!: (value: any) => void;
      vi.mocked(actions.signIn).mockReturnValue(
        new Promise((resolve) => { resolveSignIn = resolve; })
      );

      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.signIn("user@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false, error: "fail" });
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("signInAction が例外を投げても isLoading が false に戻る", async () => {
      vi.mocked(actions.signIn).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signIn("user@example.com", "password123")).rejects.toThrow(
          "Network error"
        );
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ─── signUp ─────────────────────────────────────────────────

  describe("signUp", () => {
    test("失敗時は result を返し、ルーティングしない", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signUp("existing@example.com", "password123");
      });

      expect(returnValue).toEqual({ success: false, error: "Email already registered" });
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("成功・匿名作業なし・既存プロジェクトあり → 最新プロジェクトへ遷移", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        { id: "proj-1", name: "My Design", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-1");
    });

    test("成功・匿名作業なし・既存プロジェクトなし → 新規プロジェクト作成して遷移", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/new-project-id");
    });

    test("成功・匿名作業あり → 匿名データでプロジェクト作成して遷移", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "Build me a button" }],
        fileSystemData: { "/button.tsx": { type: "file", content: "<button/>" } },
      });
      vi.mocked(createProjectModule.createProject).mockResolvedValue({
        id: "signup-anon-id",
        name: "Design from ...",
        userId: "user-1",
        messages: "[]",
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "Build me a button" }],
        })
      );
      expect(anonTracker.clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/signup-anon-id");
    });

    test("処理中は isLoading が true になり、完了後 false に戻る", async () => {
      let resolveSignUp!: (value: any) => void;
      vi.mocked(actions.signUp).mockReturnValue(
        new Promise((resolve) => { resolveSignUp = resolve; })
      );

      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.signUp("new@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp({ success: false, error: "fail" });
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("signUpAction が例外を投げても isLoading が false に戻る", async () => {
      vi.mocked(actions.signUp).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signUp("new@example.com", "password123")).rejects.toThrow(
          "Server error"
        );
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ─── エッジケース ────────────────────────────────────────────

  describe("エッジケース", () => {
    test("getAnonWorkData が null を返す場合は getProjects フローへ", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        { id: "proj-1", name: "My Design", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(anonTracker.clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-1");
    });

    test("新規プロジェクト名には乱数サフィックスが含まれる", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      const call = vi.mocked(createProjectModule.createProject).mock.calls[0][0];
      expect(call.name).toMatch(/^New Design #\d+$/);
    });

    test("匿名プロジェクト名には現在時刻が含まれる", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "test" }],
        fileSystemData: {},
      });
      vi.mocked(createProjectModule.createProject).mockResolvedValue({
        id: "anon-id",
        name: "Design from ...",
        userId: "user-1",
        messages: "[]",
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      const call = vi.mocked(createProjectModule.createProject).mock.calls[0][0];
      expect(call.name).toMatch(/^Design from .+$/);
    });
  });
});
