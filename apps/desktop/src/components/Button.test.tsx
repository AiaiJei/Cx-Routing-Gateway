import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("exposes the requested action variant and keeps native button semantics", () => {
    render(<Button variant="primary" type="submit">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("geist-button", "geist-button--primary");
    expect(button).toHaveAttribute("type", "submit");
  });

  it("supports a quiet destructive action without changing its accessible name", () => {
    render(<Button variant="danger" size="small" disabled>Delete</Button>);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveClass("geist-button--danger", "geist-button--small");
    expect(button).toBeDisabled();
  });
});
