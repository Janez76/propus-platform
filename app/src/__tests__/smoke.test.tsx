import { render, screen } from "@testing-library/react";
import { toDisplayString } from "@/lib/utils";

describe("vitest smoke", () => {
  it("renders a React component into jsdom", () => {
    render(<div>Hello Vitest</div>);
    expect(screen.getByText("Hello Vitest")).toBeInTheDocument();
  });

  it("resolves @/ path alias imports", () => {
    expect(toDisplayString("ok")).toBe("ok");
    expect(toDisplayString(null)).toBe("—");
  });
});
