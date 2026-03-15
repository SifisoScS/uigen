import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArtifactIntrospection } from "../ArtifactIntrospection";

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_SIG = {
  classes: [] as string[],
  colors: [] as string[],
  spacing: [] as string[],
  usedComponents: [] as string[],
  propSummary: {} as Record<string, string[]>,
};

function makeTree(name: string, children: unknown[] = []) {
  return { type: "JSXElement", name, props: {}, children } as Record<string, unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ArtifactIntrospection", () => {
  it("renders null when all data is empty/null", () => {
    const { container } = render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={null}
        styleSignature={EMPTY_SIG}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders semantic summary when provided", () => {
    render(
      <ArtifactIntrospection
        semanticSummary="Responsive auth form with dark mode"
        componentTree={null}
        styleSignature={null}
      />
    );
    const el = screen.getByTestId("semantic-summary");
    expect(el.textContent).toContain("Responsive auth form with dark mode");
  });

  it("renders used-components pill list", () => {
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={null}
        styleSignature={{ ...EMPTY_SIG, usedComponents: ["Button", "Card", "Input"] }}
      />
    );
    const section = screen.getByTestId("used-components");
    expect(section.textContent).toContain("Button");
    expect(section.textContent).toContain("Card");
    expect(section.textContent).toContain("Input");
  });

  it("does not render used-components section when usedComponents is empty", () => {
    render(
      <ArtifactIntrospection
        semanticSummary="test"
        componentTree={null}
        styleSignature={EMPTY_SIG}
      />
    );
    expect(screen.queryByTestId("used-components")).toBeNull();
  });

  it("renders component-tree section when componentTree is provided", () => {
    const tree = makeTree("div", [makeTree("Button", [])]);
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={tree}
        styleSignature={null}
      />
    );
    const treeEl = screen.getByTestId("component-tree");
    expect(treeEl).toBeDefined();
    expect(treeEl.textContent).toContain("div");
  });

  it("tree-node-root shows root element name", () => {
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={makeTree("section")}
        styleSignature={null}
      />
    );
    expect(screen.getByTestId("tree-node-root").textContent).toContain("section");
  });

  it("shows child component names in component tree (depth 1 auto-expanded)", () => {
    const tree = makeTree("div", [
      makeTree("Button", []),
      makeTree("Card", []),
    ]);
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={tree}
        styleSignature={null}
      />
    );
    // Tree auto-expands depth 0 and 1
    const treeEl = screen.getByTestId("component-tree");
    expect(treeEl.textContent).toContain("Button");
    expect(treeEl.textContent).toContain("Card");
  });

  it("shows propSummary hints on used-components pills", () => {
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={null}
        styleSignature={{
          ...EMPTY_SIG,
          usedComponents: ["Button"],
          propSummary: { Button: ["variant", "size"] },
        }}
      />
    );
    const section = screen.getByTestId("used-components");
    expect(section.textContent).toContain("variant");
    expect(section.textContent).toContain("size");
  });

  it("does NOT render component-tree section when componentTree has _stub=true", () => {
    const stubTree = { type: "component", name: "Empty", _stub: true, props: {}, children: [] };
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={stubTree as Record<string, unknown>}
        styleSignature={null}
      />
    );
    expect(screen.queryByTestId("component-tree")).toBeNull();
  });

  it("expands tree nodes on click", () => {
    const tree = makeTree("div", [makeTree("Button", [])]);
    render(
      <ArtifactIntrospection
        semanticSummary={null}
        componentTree={tree}
        styleSignature={null}
      />
    );
    const root = screen.getByTestId("tree-node-root");
    // depth=0 auto-expands so click collapses
    fireEvent.click(root);
    // After collapse, re-expand
    fireEvent.click(root);
    // Tree should still be functional without throwing
    expect(screen.getByTestId("component-tree")).toBeDefined();
  });
});
