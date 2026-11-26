import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubmitButton } from "./submit-button";

describe("SubmitButton", () => {
  it("shows the spinner and pending label while pending", () => {
    const html = renderToStaticMarkup(
      <SubmitButton pending pendingLabel="Saving…">
        Save draft
      </SubmitButton>,
    );
    expect(html).toContain("Saving…");
    expect(html).not.toContain("Save draft");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('data-pending="true"');
    expect(html).toContain("Submitting");
  });

  it("with indicator={false} stays blocked while pending but keeps its own label and no spinner", () => {
    // A form with two submit buttons (Save draft / Submit): React marks the whole form pending, so the button that
    // was not clicked must not say "Submitting…" as well.
    const html = renderToStaticMarkup(
      <SubmitButton pending indicator={false} pendingLabel="Submitting…">
        Submit to Venkat Sai
      </SubmitButton>,
    );
    expect(html).toContain("Submit to Venkat Sai");
    expect(html).not.toContain("Submitting…");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('role="presentation"');
    expect(html).not.toContain(">Submitting<");
  });

  it("is a plain submit button when idle", () => {
    const html = renderToStaticMarkup(<SubmitButton pendingLabel="Saving…">Save</SubmitButton>);
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Save<");
    expect(html).not.toContain("aria-disabled");
  });
});
