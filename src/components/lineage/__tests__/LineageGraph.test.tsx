import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions/get-artifact-lineage", () => ({
  getArtifactLineageDeep: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getArtifactLineageDeep } = await import("@/actions/get-artifact-lineage");
const { LineageGraph } = await import("../LineageGraph");
import type { ArtifactLineageDeep, ArtifactNode, CrossParentNode } from "@/actions/get-artifact-lineage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, name = `Artifact ${id}`): ArtifactNode {
  return {
    id,
    name,
    version: "1.0.0",
    description: null,
    authorId: null,
    createdAt: new Date("2026-01-01"),
    remixCount: 0,
    policyType: "HUMAN_ONLY",
    parentArtifactId: null,
  };
}

function makeCrossParent(id: string, name = `Workflow ${id}`): CrossParentNode {
  return {
    id,
    parentType: "WorkflowRun",
    parentName: name,
    outputSummary: null,
    relationType: "GENERATED_BY",
    createdAt: new Date("2026-01-01"),
  };
}

function makeData(
  currentId: string,
  opts: {
    parents?: ArtifactNode[];
    children?: ArtifactNode[];
    depthReached?: boolean;
    crossParents?: CrossParentNode[];
  } = {}
): ArtifactLineageDeep {
  return {
    current: makeNode(currentId, `Current ${currentId}`),
    parents: opts.parents ?? [],
    children: opts.children ?? [],
    depthReached: opts.depthReached ?? false,
    crossParents: opts.crossParents ?? [],
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LineageGraph", () => {
  it("renders the current node", () => {
    const data = makeData("cur-1");
    render(<LineageGraph initialData={data} currentId="cur-1" />);

    expect(screen.getByTestId("node-cur-1")).toBeDefined();
  });

  it("renders all ancestor and descendant nodes (2 parents + current + 3 children = 6)", () => {
    const data = makeData("cur", {
      parents: [makeNode("p1", "Parent A"), makeNode("p2", "Parent B")],
      children: [
        makeNode("c1", "Child A"),
        makeNode("c2", "Child B"),
        makeNode("c3", "Child C"),
      ],
    });

    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("node-p1")).toBeDefined();
    expect(screen.getByTestId("node-p2")).toBeDefined();
    expect(screen.getByTestId("node-cur")).toBeDefined();
    expect(screen.getByTestId("node-c1")).toBeDefined();
    expect(screen.getByTestId("node-c2")).toBeDefined();
    expect(screen.getByTestId("node-c3")).toBeDefined();
  });

  it("marks the current node aria-label with 'Current'", () => {
    const data = makeData("focal");
    render(<LineageGraph initialData={data} currentId="focal" />);

    const currentNode = screen.getByTestId("node-focal");
    expect(currentNode.getAttribute("aria-label")).toContain("Current");
  });

  it("non-current nodes have role=button and Navigate aria-label", () => {
    const child = makeNode("child-x", "My Child");
    const data = makeData("root", { children: [child] });
    render(<LineageGraph initialData={data} currentId="root" />);

    const childNode = screen.getByTestId("node-child-x");
    expect(childNode.getAttribute("role")).toBe("button");
    expect(childNode.getAttribute("aria-label")).toContain("Navigate to My Child");
  });

  it("clicking a non-current node navigates to /share/[id]", async () => {
    const user = userEvent.setup();
    const child = makeNode("nav-target", "Navigate Me");
    const data = makeData("root", { children: [child] });
    render(<LineageGraph initialData={data} currentId="root" />);

    await user.click(screen.getByTestId("node-nav-target"));

    expect(mockPush).toHaveBeenCalledWith("/share/nav-target");
  });

  it("clicking the current node does NOT navigate", async () => {
    const user = userEvent.setup();
    const data = makeData("stay-here");
    render(<LineageGraph initialData={data} currentId="stay-here" />);

    await user.click(screen.getByTestId("node-stay-here"));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("depth slider calls getArtifactLineageDeep with the new depth", async () => {
    const newData = makeData("d", { parents: [makeNode("ancestor")] });
    vi.mocked(getArtifactLineageDeep).mockResolvedValue(newData);

    render(<LineageGraph initialData={makeData("d")} currentId="d" />);

    const slider = screen.getByLabelText("Ancestry depth");
    fireEvent.change(slider, { target: { value: "3" } });

    await waitFor(() => {
      expect(getArtifactLineageDeep).toHaveBeenCalledWith("d", 3);
    });
  });

  it("updates the graph when depth-change fetch succeeds", async () => {
    const ancestor = makeNode("anc", "Grand Ancestor");
    const newData = makeData("focal", { parents: [ancestor] });
    vi.mocked(getArtifactLineageDeep).mockResolvedValue(newData);

    render(<LineageGraph initialData={makeData("focal")} currentId="focal" />);

    expect(screen.queryByTestId("node-anc")).toBeNull();

    fireEvent.change(screen.getByLabelText("Ancestry depth"), {
      target: { value: "2" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("node-anc")).toBeDefined();
    });
  });

  it("shows depthReached notice when depthReached is true", () => {
    const data = makeData("x", {
      parents: [makeNode("p")],
      depthReached: true,
    });
    render(<LineageGraph initialData={data} currentId="x" />);

    expect(screen.getByText(/max depth reached/i)).toBeDefined();
  });

  it("renders the fit-to-view button", () => {
    render(<LineageGraph initialData={makeData("a")} currentId="a" />);

    expect(screen.getByRole("button", { name: /fit to view/i })).toBeDefined();
  });

  it("renders a WorkflowRun node when crossParents contains a WorkflowRun", () => {
    const data = makeData("cur", {
      crossParents: [makeCrossParent("wf-1", "Generate AuthForm")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("workflow-node-wf-1")).toBeDefined();
  });

  it("clicking a WorkflowRun node navigates to /workflow-run/[id]", async () => {
    const user = userEvent.setup();
    const data = makeData("cur", {
      crossParents: [makeCrossParent("wf-42", "Gen Something")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    await user.click(screen.getByTestId("workflow-node-wf-42"));

    expect(mockPush).toHaveBeenCalledWith("/workflow-run/wf-42");
  });

  it("does NOT render workflow nodes when crossParents is empty", () => {
    const data = makeData("cur", { crossParents: [] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    // No element with the workflow-node- prefix should be present
    const canvas = screen.getByTestId("graph-canvas");
    expect(canvas.querySelector("[data-testid^='workflow-node-']")).toBeNull();
  });
});
