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
import type { ArtifactLineageDeep, ArtifactNode, CrossParentNode, VariantNode } from "@/actions/get-artifact-lineage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  name = `Artifact ${id}`,
  semanticSummary: string | null = null,
  firstColor: string | null = null,
  usedComponents: string[] = []
): ArtifactNode {
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
    semanticSummary,
    firstColor,
    usedComponents,
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

function makeVariant(
  id: string,
  suggestion = `Suggestion for ${id}`,
  status = "DRAFT"
): VariantNode {
  return {
    id,
    name: `AuthForm — ${suggestion}`,
    suggestion,
    status,
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
    variants?: VariantNode[];
  } = {}
): ArtifactLineageDeep {
  return {
    current: makeNode(currentId, `Current ${currentId}`),
    parents: opts.parents ?? [],
    children: opts.children ?? [],
    depthReached: opts.depthReached ?? false,
    crossParents: opts.crossParents ?? [],
    variants: opts.variants ?? [],
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

  it("renders a DatasetSnapshot node when crossParents contains a DatasetSnapshot", () => {
    const dsParent: CrossParentNode = {
      id: "ds-99",
      parentType: "DatasetSnapshot",
      parentName: "AuthForm Training Data",
      outputSummary: null,
      relationType: "INFORMED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const data = makeData("cur", { crossParents: [dsParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("dataset-node-ds-99")).toBeDefined();
  });

  it("clicking a DatasetSnapshot node navigates to /dataset-snapshot/[id]", async () => {
    const user = userEvent.setup();
    const dsParent: CrossParentNode = {
      id: "ds-77",
      parentType: "DatasetSnapshot",
      parentName: "My Dataset",
      outputSummary: null,
      relationType: "INFORMED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const data = makeData("cur", { crossParents: [dsParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    await user.click(screen.getByTestId("dataset-node-ds-77"));

    expect(mockPush).toHaveBeenCalledWith("/dataset-snapshot/ds-77");
  });

  it("shows semanticSummary excerpt as subtitle on artifact nodes", () => {
    const node = makeNode("sum-1", "AuthForm", "Responsive auth form with dark mode support");
    const data = makeData("sum-1", { children: [node] });
    // Use sum-1 as a child so it renders a node (current is also sum-1 but makeData wraps it separately)
    const parentData = makeData("root-x", { children: [node] });
    render(<LineageGraph initialData={parentData} currentId="root-x" />);

    const childNode = screen.getByTestId("node-sum-1");
    expect(childNode.textContent).toContain("Responsive auth form with dark mode support");
  });

  it("does not render summary subtitle when semanticSummary is null", () => {
    const node = makeNode("no-sum", "NoSummary", null);
    const data = makeData("root-ns", { children: [node] });
    render(<LineageGraph initialData={data} currentId="root-ns" />);

    const childNode = screen.getByTestId("node-no-sum");
    // Should only contain the name, no extra summary text
    expect(childNode.textContent).toContain("NoSummary");
    expect(childNode.textContent).not.toContain("undefined");
    expect(childNode.textContent).not.toContain("null");
  });

  it("renders color swatch dot when node has firstColor with a known Tailwind color", () => {
    const nodeWithColor = makeNode("swatch-1", "ColoredArtifact", null, "bg-violet-500");
    const data = makeData("root-sw", { children: [nodeWithColor] });
    render(<LineageGraph initialData={data} currentId="root-sw" />);

    expect(screen.getByTestId("color-swatch-swatch-1")).toBeDefined();
  });

  it("does NOT render color swatch when firstColor is null", () => {
    const nodeNoColor = makeNode("no-color-1", "NoColorArtifact", null, null);
    const data = makeData("root-nc", { children: [nodeNoColor] });
    render(<LineageGraph initialData={data} currentId="root-nc" />);

    const canvas = screen.getByTestId("graph-canvas");
    expect(canvas.querySelector("[data-testid='color-swatch-no-color-1']")).toBeNull();
  });

  it("renders usedComponents subtitle when node has used registry components", () => {
    const node = makeNode("comp-1", "AuthForm", null, null, ["Button", "Card", "Input"]);
    const data = makeData("root-uc", { children: [node] });
    render(<LineageGraph initialData={data} currentId="root-uc" />);

    const childNode = screen.getByTestId("node-comp-1");
    expect(childNode.textContent).toContain("Used:");
    expect(childNode.textContent).toContain("Button");
    expect(childNode.textContent).toContain("Card");
  });

  it("does NOT render usedComponents subtitle when usedComponents is empty", () => {
    const node = makeNode("no-comp-1", "PlainArtifact", null, null, []);
    const data = makeData("root-nuc", { children: [node] });
    render(<LineageGraph initialData={data} currentId="root-nuc" />);

    const childNode = screen.getByTestId("node-no-comp-1");
    expect(childNode.querySelector("[data-testid='used-components-no-comp-1']")).toBeNull();
  });

  it("renders an AgentInvocation node when crossParents contains an AgentInvocation", () => {
    const agentParent: CrossParentNode = {
      id: "inv-1",
      parentType: "AgentInvocation",
      parentName: "StubAgent",
      outputSummary: "Add aria-label to interactive elements",
      relationType: "EVALUATED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const data = makeData("cur", { crossParents: [agentParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("agent-node-inv-1")).toBeDefined();
  });

  it("clicking an AgentInvocation node navigates to /agent-invocation/[id]", async () => {
    const user = userEvent.setup();
    const agentParent: CrossParentNode = {
      id: "inv-42",
      parentType: "AgentInvocation",
      parentName: "Grok",
      outputSummary: null,
      relationType: "EVALUATED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const data = makeData("cur", { crossParents: [agentParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    await user.click(screen.getByTestId("agent-node-inv-42"));

    expect(mockPush).toHaveBeenCalledWith("/agent-invocation/inv-42");
  });

  it("AgentInvocation node shows EVAL badge", () => {
    const agentParent: CrossParentNode = {
      id: "inv-badge",
      parentType: "AgentInvocation",
      parentName: "StubAgent",
      outputSummary: null,
      relationType: "EVALUATED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const data = makeData("cur", { crossParents: [agentParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("agent-node-inv-badge").textContent).toContain("EVAL");
  });

  it("renders a variant node when variants contains an entry", () => {
    const data = makeData("cur", {
      variants: [makeVariant("var-1", "Add aria-label to buttons")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("variant-node-var-1")).toBeDefined();
  });

  it("clicking a variant node navigates to /{id}", async () => {
    const user = userEvent.setup();
    const data = makeData("cur", {
      variants: [makeVariant("var-42", "Use shadcn Button")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    await user.click(screen.getByTestId("variant-node-var-42"));

    expect(mockPush).toHaveBeenCalledWith("/var-42");
  });

  it("does NOT render variant nodes when variants is empty", () => {
    const data = makeData("cur", { variants: [] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    const canvas = screen.getByTestId("graph-canvas");
    expect(canvas.querySelector("[data-testid^='variant-node-']")).toBeNull();
  });

  it("variant node shows VAR badge", () => {
    const data = makeData("cur", {
      variants: [makeVariant("var-badge", "Improve contrast")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    expect(screen.getByTestId("variant-node-var-badge").textContent).toContain("VAR");
  });

  it("variant node shows the suggestion text", () => {
    const data = makeData("cur", {
      variants: [makeVariant("var-txt", "Extract theme tokens")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    const node = screen.getByTestId("variant-node-var-txt");
    expect(node.textContent).toContain("Extract theme tokens");
  });

  it("APPROVED variant node has data-status='APPROVED'", () => {
    const data = makeData("cur", {
      variants: [makeVariant("var-appr", "Add aria-label", "APPROVED")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    const node = screen.getByTestId("variant-node-var-appr");
    expect(node.getAttribute("data-status")).toBe("APPROVED");
  });

  it("REJECTED variant node has data-status='REJECTED'", () => {
    const data = makeData("cur", {
      variants: [makeVariant("var-rej", "Some suggestion", "REJECTED")],
    });
    render(<LineageGraph initialData={data} currentId="cur" />);

    const node = screen.getByTestId("variant-node-var-rej");
    expect(node.getAttribute("data-status")).toBe("REJECTED");
  });

  it("DatasetSnapshot node shows DATA badge, WorkflowRun node shows RUN badge", () => {
    const dsParent: CrossParentNode = {
      id: "ds-badge",
      parentType: "DatasetSnapshot",
      parentName: "My Dataset",
      outputSummary: null,
      relationType: "INFORMED_BY",
      createdAt: new Date("2026-01-01"),
    };
    const wfParent = makeCrossParent("wf-badge", "My Workflow");
    const data = makeData("cur", { crossParents: [dsParent, wfParent] });
    render(<LineageGraph initialData={data} currentId="cur" />);

    const dsNode = screen.getByTestId("dataset-node-ds-badge");
    const wfNode = screen.getByTestId("workflow-node-wf-badge");
    expect(dsNode.textContent).toContain("DATA");
    expect(wfNode.textContent).toContain("RUN");
  });
});
