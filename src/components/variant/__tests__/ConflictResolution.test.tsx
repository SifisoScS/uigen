import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: vi.fn(({ onMount, onChange }: {
    onMount?: (editor: unknown) => void;
    onChange?: () => void;
  }) => {
    // Expose a stable fake modified-editor ref via onMount
    if (onMount) {
      const fakeModifiedEditor = {
        getValue: vi.fn(() => "edited content"),
        setValue: vi.fn(),
        onDidChangeModelContent: vi.fn(),
      };
      onMount({ getModifiedEditor: () => fakeModifiedEditor });
    }
    return (
      <div
        data-testid="mock-diff-editor"
        onClick={() => onChange?.()}
      />
    );
  }),
}));

vi.mock("@/actions/resolve-variant-conflict", () => ({
  resolveVariantConflict: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { ConflictResolution } from "../ConflictResolution";
const { resolveVariantConflict } = await import("@/actions/resolve-variant-conflict");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FILE_A = {
  path: "/App.tsx",
  originalContent: "original App content",
  variantContent: "variant App content",
};

const FILE_B = {
  path: "/Nav.tsx",
  originalContent: "original Nav content",
  variantContent: "variant Nav content",
};

const DEFAULT_PROPS = {
  originalArtifactId: "art-1",
  variantProjectId: "proj-var-1",
  conflictingFiles: [FILE_A],
  onResolved: vi.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveVariantConflict).mockResolvedValue({
    mergedAt: new Date("2026-01-01T00:00:00Z"),
    conflictResolvedAt: new Date("2026-01-01T00:00:00Z"),
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConflictResolution", () => {
  it("renders conflict count and auto-merge button", () => {
    render(<ConflictResolution {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("auto-merge-btn")).toBeTruthy();
    expect(screen.getByText(/1 file conflict/i)).toBeTruthy();
  });

  it("renders a Monaco DiffEditor for each conflicting file", () => {
    render(
      <ConflictResolution
        {...DEFAULT_PROPS}
        conflictingFiles={[FILE_A, FILE_B]}
      />
    );

    expect(screen.getByTestId("monaco-diff--App.tsx")).toBeTruthy();
    expect(screen.getByTestId("monaco-diff--Nav.tsx")).toBeTruthy();
  });

  it("keep-original and take-variant buttons are rendered per file", () => {
    render(<ConflictResolution {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("keep-original--App.tsx")).toBeTruthy();
    expect(screen.getByTestId("take-variant--App.tsx")).toBeTruthy();
  });

  it("auto-merge button is present and clickable without throwing", () => {
    render(<ConflictResolution {...DEFAULT_PROPS} conflictingFiles={[FILE_A, FILE_B]} />);

    const btn = screen.getByTestId("auto-merge-btn");
    expect(btn).toBeTruthy();
    // Clicking should not throw
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it("calls resolveVariantConflict with resolvedContent on submit", async () => {
    const onResolved = vi.fn();
    render(<ConflictResolution {...DEFAULT_PROPS} onResolved={onResolved} />);

    fireEvent.click(screen.getByTestId("resolve-conflicts-btn"));

    await waitFor(() => {
      expect(resolveVariantConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          originalArtifactId: "art-1",
          variantProjectId: "proj-var-1",
          resolutions: expect.arrayContaining([
            expect.objectContaining({
              path: "/App.tsx",
              resolvedContent: expect.any(String),
            }),
          ]),
        })
      );
    });
  });

  it("calls onResolved with mergedAt date on success", async () => {
    const onResolved = vi.fn();
    render(<ConflictResolution {...DEFAULT_PROPS} onResolved={onResolved} />);

    fireEvent.click(screen.getByTestId("resolve-conflicts-btn"));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledWith(new Date("2026-01-01T00:00:00Z"));
    });
  });

  it("shows error message when resolveVariantConflict rejects", async () => {
    vi.mocked(resolveVariantConflict).mockRejectedValue(new Error("Merge failed"));
    render(<ConflictResolution {...DEFAULT_PROPS} />);

    fireEvent.click(screen.getByTestId("resolve-conflicts-btn"));

    await waitFor(() => {
      expect(screen.getByText("Merge failed")).toBeTruthy();
    });
  });
});
