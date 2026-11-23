import { describe, expect, it } from "vitest";

import { buildLocalBusinessJsonLd, parseOpeningHours } from "./local-business";

describe("parseOpeningHours", () => {
  it("reads common business-hours text", () => {
    expect(parseOpeningHours("Monday to Saturday, 9:30 am to 6:00 pm IST")).toEqual(["Mo-Sa 09:30-18:00"]);
    expect(parseOpeningHours("Mon - Sat 9:30 to 6 pm")).toEqual(["Mo-Sa 09:30-18:00"]);
    expect(parseOpeningHours("Open daily 10:00-19:00")).toEqual(["Mo-Su 10:00-19:00"]);
    expect(parseOpeningHours("Call us any time")).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
  });
});

describe("buildLocalBusinessJsonLd", () => {
  it("builds an EmploymentAgency with address, phones, hours and sameAs", () => {
    const ld = buildLocalBusinessJsonLd({
      name: "Venkat Sai Welding Works and Testing Center",
      alternateName: "Venkat Sai Global",
      url: "https://example.org/",
      logo: "https://example.org/icon",
      address: { streetAddress: "B-Block, Plot D-6, Autonagar, Gajuwaka", addressLocality: "Visakhapatnam", addressRegion: "Andhra Pradesh", postalCode: "530012", addressCountry: "IN" },
      phones: ["+919494263388", "+917386649477", "+919494263388"],
      email: "office@example.org",
      hours: "Monday to Saturday, 9:30 am to 6:00 pm IST",
      sameAs: ["https://whatsapp.com/channel/abc", "javascript:alert(1)"],
    });
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "EmploymentAgency",
      "@id": "https://example.org/#organization",
      telephone: "+919494263388",
      openingHours: ["Mo-Sa 09:30-18:00"],
      address: { "@type": "PostalAddress", addressCountry: "IN", postalCode: "530012" },
      sameAs: ["https://whatsapp.com/channel/abc"],
    });
    expect(ld.contactPoint).toHaveLength(2);
    expect(ld.geo).toBeUndefined();
  });
});
