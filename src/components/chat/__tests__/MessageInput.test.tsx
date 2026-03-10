import { test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../MessageInput";

afterEach(() => {
  cleanup();
});

test("renders with placeholder text", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByPlaceholderText(
    "Describe changes or a new component…"
  );
  expect(textarea).toBeDefined();
});

test("displays the input value", () => {
  const mockProps = {
    input: "Test input value",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByDisplayValue("Test input value");
  expect(textarea).toBeDefined();
});

test("calls handleInputChange when typing", async () => {
  const handleInputChange = vi.fn();
  const mockProps = {
    input: "",
    handleInputChange,
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByPlaceholderText(
    "Describe changes or a new component…"
  );
  await userEvent.type(textarea, "Hello");

  expect(handleInputChange).toHaveBeenCalled();
});

test("calls handleSubmit when form is submitted", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const form = screen.getByRole("textbox").closest("form")!;
  fireEvent.submit(form);

  expect(handleSubmit).toHaveBeenCalledOnce();
});

test("submits form when Enter is pressed without shift", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

  expect(handleSubmit).toHaveBeenCalledOnce();
});

test("does not submit form when Enter is pressed with shift", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

  expect(handleSubmit).not.toHaveBeenCalled();
});

test("disables textarea when isLoading is true", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: true,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  expect(textarea).toHaveProperty("disabled", true);
});

test("disables submit button when isLoading is true", () => {
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: true,
  };

  render(<MessageInput {...mockProps} />);

  const submitButton = screen.getByRole("button");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("disables submit button when input is empty", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const submitButton = screen.getByRole("button");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("disables submit button when input contains only whitespace", () => {
  const mockProps = {
    input: "   ",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const submitButton = screen.getByRole("button");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("enables submit button when input has content and not loading", () => {
  const mockProps = {
    input: "Valid content",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const submitButton = screen.getByRole("button");
  expect(submitButton).toHaveProperty("disabled", false);
});

test("applies correct CSS classes based on loading state", () => {
  const { rerender } = render(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={false}
    />
  );

  let submitButton = screen.getByRole("button");
  // Active state — blue background
  expect(submitButton.className).toContain("bg-blue-600");

  rerender(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={true}
    />
  );

  submitButton = screen.getByRole("button");
  // Disabled/loading state — muted background
  expect(submitButton.className).toContain("bg-[#252525]");
  expect(submitButton.className).toContain("cursor-not-allowed");
});

test("applies muted styling to send icon when loading", () => {
  const { rerender } = render(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={false}
    />
  );

  // Not loading — button has blue background
  let submitButton = screen.getByRole("button");
  expect(submitButton.className).toContain("bg-blue-600");

  rerender(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={true}
    />
  );

  // Loading — button has muted background
  submitButton = screen.getByRole("button");
  expect(submitButton.className).toContain("bg-[#252525]");
});

test("textarea has correct styling classes", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  expect(textarea.className).toContain("resize-none");
  expect(textarea.className).toContain("focus:outline-none");
  expect(textarea.className).toContain("bg-transparent");
});

test("submit button click triggers form submission", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  render(<MessageInput {...mockProps} />);

  const submitButton = screen.getByRole("button");
  await userEvent.click(submitButton);

  expect(handleSubmit).toHaveBeenCalledOnce();
});
