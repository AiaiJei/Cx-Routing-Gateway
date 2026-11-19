import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("connects its label and hint to the input", () => {
    render(<TextField label="Provider URL" hint="Use the base API URL." placeholder="https://api.example" />);
    const input = screen.getByRole("textbox", { name: "Provider URL" });
    expect(input).toHaveClass("geist-input");
    expect(input).toHaveAccessibleDescription("Use the base API URL.");
  });
});
