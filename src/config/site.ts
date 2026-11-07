/**
 * Brand constants (client-safe). Editable presentation content (contact details, hero copy,
 * social links, grievance officer...) lives in the CMS site settings, NOT here.
 * Never add statistics, licences, client names or partnership claims to this file.
 */
export const BRAND = {
  name: "Venkat Sai Global",
  shortName: "Venkat Sai",
  category: "The Global Opportunity Network",
  statement: "One Platform. Every Opportunity. One Trusted Destination.",
  tagline: "Discover. Learn. Qualify. Work. Grow.",
  legalEntity: "Venkat Sai Welding Works and Testing Center",
  headquarters: "Auto Nagar, Visakhapatnam, Andhra Pradesh, India",
  promise: "We bring opportunities, employers, skills, training and careers together through one trusted platform.",
} as const;

export const DEFAULT_SEO = {
  title: `${BRAND.name} — ${BRAND.category}`,
  description:
    "From education and skill development to internships, recruitment, international employment and workforce solutions, Venkat Sai brings people and organisations together through one integrated opportunity network.",
} as const;
