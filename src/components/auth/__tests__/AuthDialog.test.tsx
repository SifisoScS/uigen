import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthDialog } from "../AuthDialog";

afterEach(cleanup);

// Avoid Radix portal/JSDOM issues by rendering Dialog content inline
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

// Mock forms so tests focus on dialog-level behaviour only
vi.mock("../SignInForm", () => ({
  SignInForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <div data-testid="sign-in-form">
      <button onClick={onSuccess}>mock-sign-in</button>
    </div>
  ),
}));

vi.mock("../SignUpForm", () => ({
  SignUpForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <div data-testid="sign-up-form">
      <button onClick={onSuccess}>mock-sign-up</button>
    </div>
  ),
}));

describe("AuthDialog", () => {
  it("renders the sign-in form by default", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signin" />);
    expect(screen.getByTestId("sign-in-form")).toBeDefined();
    expect(screen.queryByTestId("sign-up-form")).toBeNull();
  });

  it("renders the sign-up form when defaultMode is signup", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signup" />);
    expect(screen.getByTestId("sign-up-form")).toBeDefined();
    expect(screen.queryByTestId("sign-in-form")).toBeNull();
  });

  it("does not render when closed", () => {
    render(<AuthDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("switches to sign-up when the toggle link is clicked", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signin" />);
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    expect(screen.getByTestId("sign-up-form")).toBeDefined();
    expect(screen.queryByTestId("sign-in-form")).toBeNull();
  });

  it("switches back to sign-in from sign-up", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signup" />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByTestId("sign-in-form")).toBeDefined();
    expect(screen.queryByTestId("sign-up-form")).toBeNull();
  });

  it("calls onOpenChange(false) when the sign-in form signals success", () => {
    const onOpenChange = vi.fn();
    render(
      <AuthDialog open onOpenChange={onOpenChange} defaultMode="signin" />
    );
    fireEvent.click(screen.getByText("mock-sign-in"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when the sign-up form signals success", () => {
    const onOpenChange = vi.fn();
    render(
      <AuthDialog open onOpenChange={onOpenChange} defaultMode="signup" />
    );
    fireEvent.click(screen.getByText("mock-sign-up"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets mode to defaultMode when the prop changes", () => {
    const { rerender } = render(
      <AuthDialog open onOpenChange={vi.fn()} defaultMode="signin" />
    );
    expect(screen.getByTestId("sign-in-form")).toBeDefined();

    rerender(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signup" />);
    expect(screen.getByTestId("sign-up-form")).toBeDefined();
  });

  it("shows 'Welcome back' title in sign-in mode", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signin" />);
    expect(screen.getByText("Welcome back")).toBeDefined();
  });

  it("shows 'Create an account' title in sign-up mode", () => {
    render(<AuthDialog open onOpenChange={vi.fn()} defaultMode="signup" />);
    expect(screen.getByText("Create an account")).toBeDefined();
  });
});
