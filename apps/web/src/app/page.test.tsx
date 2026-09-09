import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Product" })).toBeInTheDocument();
  });
});
