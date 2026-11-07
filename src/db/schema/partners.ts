/**
 * Domain schema: partners
 * Layer 7 — may import from: taxonomy, core, identity, organizations, system, employers.
 * Never import from a later layer (see docs/DATA_MODEL.md → Layering).
 *
 * PLANNED TABLES (to be implemented): partner_profiles (1:1 organizations where type=recruitment_partner: business type, services, authorised territories), partner_licences (e.g. India Recruiting Agent licence under the Emigration Act: number, issuing authority, validity, file, verification), partner_agreements (versioned agreement acceptance, commercial terms), partner_territories.
 */
export {};
