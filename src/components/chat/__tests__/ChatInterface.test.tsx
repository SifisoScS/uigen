import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInterface } from "../ChatInterface";
import { useChat } from "@/lib/contexts/chat-context";

// Mock the dependencies
vi.mock("@/lib/contexts/chat-context", () => ({
  useChat: vi.fn(),
}));

// Mock the ScrollArea component
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: any) => (
    <div className={className} data-radix-scroll-area-viewport>
      {children}
    </div>
  ),
}));

// Mock the child components
vi.mock("../MessageList", () => ({
  MessageList: ({ messages, isLoading }: any) => (
    <div data-testid="message-list">
      {messages.length} messages, loading: {isLoading.toString()}
    </div>
  ),
}));

vi.mock("../MessageInput", () => ({
  MessageInput: ({ input, handleInputChange, handleSubmit, isLoading }: any) => (
    <div data-testid="message-input">
      <input
        value={input}
        onChange={handleInputChange}
        data-testid="input"
        disabled={isLoading}
      />
      <button onClick={handleSubmit} disabled={isLoading} data-testid="submit">
        Submit
      </button>
    </div>
  ),
}));

// A non-empty messages array used by tests that need the message view rendered
const STUB_MESSAGES = [{ id: "1", role: "user", content: "Hello" }];

const mockUseChat = {
  messages: STUB_MESSAGES,
  input: "",
  setInput: vi.fn(),
  handleInputChange: vi.fn(),
  handleSubmit: vi.fn(),
  status: "idle" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  (useChat as any).mockReturnValue(mockUseChat);
});

afterEach(() => {
  cleanup();
});

test("renders chat interface with message list and input", () => {
  render(<ChatInterface />);

  expect(screen.getByTestId("message-list")).toBeDefined();
  expect(screen.getByTestId("message-input")).toBeDefined();
});

test("passes correct props to MessageList", () => {
  const messages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Hi there!" },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    status: "streaming",
  });

  render(<ChatInterface />);

  const messageList = screen.getByTestId("message-list");
  expect(messageList.textContent).toContain("2 messages");
  expect(messageList.textContent).toContain("loading: true");
});

test("passes correct props to MessageInput", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: STUB_MESSAGES,
    input: "Test input",
    status: "submitted",
  });

  render(<ChatInterface />);

  const input = screen.getByTestId("input");
  expect(input).toHaveProperty("value", "Test input");
  expect(input).toHaveProperty("disabled", true);
});

test("isLoading is true when status is submitted", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: STUB_MESSAGES,
    status: "submitted",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("isLoading is true when status is streaming", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: STUB_MESSAGES,
    status: "streaming",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("isLoading is false when status is idle", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: STUB_MESSAGES,
    status: "idle",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", false);
});

test("scrolls when messages change", () => {
  const { rerender } = render(<ChatInterface />);

  // Get initial scroll container
  const scrollContainer = screen
    .getByTestId("message-list")
    .closest("[data-radix-scroll-area-viewport]");
  expect(scrollContainer).toBeDefined();

  // Update messages — this should trigger the useEffect
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [
      { id: "1", role: "user", content: "Hello" },
      { id: "2", role: "assistant", content: "Hi there!" },
    ],
  });

  rerender(<ChatInterface />);

  // Verify component re-rendered with new messages
  const messageList = screen.getByTestId("message-list");
  expect(messageList.textContent).toContain("2 messages");
});

test("renders with correct layout classes", () => {
  const { container } = render(<ChatInterface />);

  const mainDiv = container.firstChild as HTMLElement;
  expect(mainDiv.className).toContain("flex");
  expect(mainDiv.className).toContain("flex-col");
  expect(mainDiv.className).toContain("h-full");
  expect(mainDiv.className).toContain("overflow-hidden");

  const scrollArea = screen
    .getByTestId("message-list")
    .closest(".flex-1");
  expect(scrollArea?.className).toContain("overflow-hidden");

  const inputWrapper = screen.getByTestId("message-input").parentElement;
  expect(inputWrapper?.className).toContain("flex-shrink-0");
});

test("empty state renders when there are no messages", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [],
    status: "idle",
  });

  render(<ChatInterface />);

  // Empty state shows the heading, not the message list / input components
  expect(screen.queryByTestId("message-list")).toBeNull();
  expect(screen.queryByTestId("message-input")).toBeNull();
  expect(screen.getByText("What do you want to build?")).toBeDefined();
});
