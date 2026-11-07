import { describe, expect, it } from "vitest";

import { looksLikeSvg, svgHasActiveContent } from "./svg";

const wrap = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg"${attrs}>${inner}</svg>`;

describe("svgHasActiveContent", () => {
  it("accepts plain vector artwork with internal references", () => {
    const safe = wrap(
      `<defs><linearGradient id="g"><stop offset="0" stop-color="#16a6a1"/></linearGradient></defs>
       <rect width="10" height="10" fill="url(#g)" style="fill: url('#g')"/><use href="#g"/><use xlink:href="#g"/>
       <!-- a comment --><text x="1" y="2">Venkat Sai</text>`,
      ' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"',
    );
    expect(svgHasActiveContent(safe)).toBe(false);
  });

  it.each([
    ["script element", wrap("<script>alert(1)</script>")],
    ["script with namespace attrs", wrap('<script type="text/javascript">x()</script>')],
    ["event handler", wrap('<rect onload="alert(1)" width="1" height="1"/>')],
    ["event handler on root", '<svg xmlns="http://www.w3.org/2000/svg" onclick="x()"></svg>'],
    ["slash-separated event handler", '<svg/onload=alert(1)>'],
    ["quote-adjacent event handler", wrap('<rect width="1"onmouseover="x()"/>')],
    ["javascript: link", wrap('<a href="javascript:alert(1)"><text>x</text></a>')],
    ["entity-encoded javascript: link", wrap('<a href="&#106;avascript:alert(1)"><text>x</text></a>')],
    ["external image", wrap('<image href="https://tracker.example/pixel.png" width="1" height="1"/>')],
    ["external xlink", wrap('<use xlink:href="https://evil.example/sprite.svg#a"/>')],
    ["nested svg data URI", wrap('<image href="data:image/svg+xml;base64,PHN2Zz4=" />')],
    ["foreignObject", wrap("<foreignObject><div>html</div></foreignObject>")],
    ["iframe", wrap('<iframe src="https://evil.example"></iframe>')],
    ["DTD / entity", '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'],
    ["css import", wrap('<style>@import url("https://evil.example/x.css");</style>')],
    ["css external url", wrap('<style>rect { fill: url("https://evil.example/x"); }</style>')],
    ["animated href", wrap('<a><set attributeName="href" to="javascript:alert(1)"/></a>')],
  ])("rejects %s", (_label, markup) => {
    expect(svgHasActiveContent(markup)).toBe(true);
  });

  it("allows embedded raster data URIs", () => {
    expect(svgHasActiveContent(wrap('<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>'))).toBe(false);
  });
});

describe("looksLikeSvg", () => {
  it("recognises SVG with or without an XML prolog and comments", () => {
    expect(looksLikeSvg("<svg xmlns='http://www.w3.org/2000/svg'></svg>")).toBe(true);
    expect(looksLikeSvg('﻿<?xml version="1.0"?>\n<!-- Generator: x --><svg></svg>')).toBe(true);
    expect(looksLikeSvg("<html><svg></svg></html>")).toBe(false);
    expect(looksLikeSvg("plain text")).toBe(false);
  });
});
