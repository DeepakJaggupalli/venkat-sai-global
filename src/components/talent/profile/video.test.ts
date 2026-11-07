import { describe, expect, it } from "vitest";

import { toVideoEmbed } from "./video";

describe("toVideoEmbed", () => {
  it("embeds YouTube watch, short and share links through youtube-nocookie", () => {
    expect(toVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toVideoEmbed("https://youtu.be/dQw4w9WgXcQ?t=10")?.id).toBe("dQw4w9WgXcQ");
    expect(toVideoEmbed("https://m.youtube.com/shorts/abcDEF12345")?.provider).toBe("youtube");
    expect(toVideoEmbed("https://www.youtube.com/embed/abcDEF12345")?.id).toBe("abcDEF12345");
  });

  it("embeds Vimeo links without tracking", () => {
    expect(toVideoEmbed("https://vimeo.com/123456789")?.embedUrl).toBe("https://player.vimeo.com/video/123456789?dnt=1");
    expect(toVideoEmbed("https://player.vimeo.com/video/123456789")?.id).toBe("123456789");
  });

  it("rejects other hosts, plain http and malformed ids", () => {
    expect(toVideoEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toVideoEmbed("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toVideoEmbed("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(toVideoEmbed("https://www.youtube.com/channel/xyz")).toBeNull();
    expect(toVideoEmbed("not a url")).toBeNull();
    expect(toVideoEmbed(null)).toBeNull();
  });
});
