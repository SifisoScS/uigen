"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignUpFormProps {
  onSuccess?: () => void;
}

type PasswordStrength = "weak" | "medium" | "strong";

function getPasswordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) return null;
  if (password.length < 8) return "weak";
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score =
    (hasUppercase ? 1 : 0) +
    (hasLowercase ? 1 : 0) +
    (hasDigit ? 1 : 0) +
    (hasSpecial ? 1 : 0);
  if (password.length >= 12 && score >= 3) return "strong";
  if (score >= 2) return "medium";
  return "weak";
}

const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { label: string; bars: number; color: string }
> = {
  weak: { label: "Weak", bars: 1, color: "bg-red-500" },
  medium: { label: "Fair", bars: 2, color: "bg-yellow-500" },
  strong: { label: "Strong", bars: 3, color: "bg-green-500" },
};

function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const { label, bars, color } = strength ? STRENGTH_CONFIG[strength] : { label: "", bars: 0, color: "" };

  return (
    <div id="password-strength" aria-live="polite" aria-atomic="true" className="space-y-1">
      {strength && (
        <>
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= bars ? color : "bg-neutral-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            Password strength:{" "}
            <span
              className={
                strength === "strong"
                  ? "text-green-600"
                  : strength === "medium"
                    ? "text-yellow-600"
                    : "text-red-600"
              }
            >
              {label}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

export function SignUpForm({ onSuccess }: SignUpFormProps) {
  const { signUp, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const result = await signUp(email, password);

    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.error || "Failed to sign up");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          minLength={8}
          aria-describedby="password-strength"
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Creating account..." : "Sign Up"}
      </Button>
    </form>
  );
}
