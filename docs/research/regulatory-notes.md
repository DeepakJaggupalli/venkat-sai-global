# Regulatory notes

Research note for Venkat Sai Global. Status: **as of 2026-11-07**. Every link was accessed on **2026-11-07** unless another date is given.

> **Not legal advice.** These notes were compiled by an engineer from public sources to guide product design. Laws, rules and official figures change, translations of foreign laws are unofficial, and several points below are marked as unverified or conflicting. **Everything in this document must be validated by qualified legal counsel** (Indian counsel for emigration, data protection, IT, tax and labour law; counsel in each destination country; EU counsel for GDPR) and by a chartered accountant for GST, before the business relies on it or makes any public claim based on it.

Companion document: [Competitor benchmark](./competitor-benchmark.md).

## Evidence labels

| Label | Meaning |
|---|---|
| **[Primary]** | Statute, rule, Gazette text, or an official government page or document (including Indian missions abroad and official translations). |
| **[Secondary]** | Law-firm commentary, news, NGO or ILO-project summaries, consolidated texts on private sites, or unofficial translations. |
| **[Unverified]** | Could not be confirmed from an accessible source on 2026-11-07, or sources conflict. |
| **[Assessment]** | Our reading or recommendation. Needs counsel's confirmation. |

## 0. What matters most for the product (summary)

1. **IT Rules grievance timelines were shortened.** Since 20 February 2026 an intermediary's grievance officer must resolve complaints within **7 days** (was 15), act on certain content complaints within **36 hours** (was 72), remove intimate or impersonating content within **2 hours** (was 24), and take down unlawful content within **3 hours** of actual knowledge (was 36). Our default `privacy.grievance_resolution_days = 15` and the timeline comment on `GRIEVANCE_TYPES` are out of date. (§3)
2. **DPDP Rules 2025 are notified.** Consent-manager provisions start about **13–14 November 2026**; notice, consent, security, breach, children's data, retention and rights obligations start about **13–14 May 2027**. A proposal to shorten the timeline had not been notified as of the latest trackers. Build to the rules now. (§2)
3. **Emigration Rules cap what a recruiting agent may collect from a worker at ₹30,000 plus GST**, payable only digitally or by bank draft and against a receipt. Recruiting agents need an eMigrate registration certificate; ECR passport holders need emigration clearance for work in **19 ECR countries** (clearance for Libya and Yemen is suspended); PBBY insurance is mandatory for them. MEA had notified **3,505 illegal agents** on eMigrate as of 9 April 2026. A bill to replace the Act is still pending. (§1)
4. **Fair recruitment goes further than Indian law.** ILO guidance says workers should pay **no** recruitment fees or related costs (including skills tests, medicals, orientation, travel and visas). The UAE, Saudi Arabia, Qatar and Oman put recruitment costs on employers or prohibit charging workers; Kuwait (private sector) and Bahrain do not explicitly prohibit it. We recommend a platform-wide zero-fee rule. (§6, §7)
5. **The four labour codes are in force since 21 November 2025.** The Contract Labour Act 1970 is repealed and its subject matter moved to the OSH Code, with the licensing threshold raised to 50 contract workers; Andhra Pradesh notified final OSH rules on 7 August 2026. (§5)
6. **GST on recruitment and manpower services (SAC heading 9985) is 18%.** Since the Finance Act 2026, intermediary services to overseas clients may qualify as zero-rated exports. (§4)
7. **GDPR applies only if we target people in the EU or monitor their behaviour.** India has no EU adequacy decision. (§8)

---

## 1. India: Emigration Act 1983 and Emigration Rules 1983

### 1.1 Who must be registered

- No person or agency may function as a recruiting agent (RA) without a valid certificate from the registering authority (Section 10 of the Act). The registering authority is the Joint Secretary (Overseas Employment) and Protector General of Emigrants, MEA, supported by 16 Protector of Emigrants (PoE) offices. [Primary] [MEA, Overview of OE & PGE Division, file dated 21-04-2026](https://www.mea.gov.in/images/pdf/01-Overview-of-work-of-Overseas-Employment-21-04-2026.pdf)
  - The listed PoE offices include Hyderabad and Bhubaneswar, the nearest to Visakhapatnam in that list. [Primary, same document; "nearest" is our reading]
- Registration and recruitment run through **eMigrate** (launched 2015), a business-to-business portal for foreign employers (FEs) and RAs, integrated with Passport Seva, the Bureau of Immigration, PBBY insurers and DG Shipping. [Primary] (same document)
- **Foreign employers must register on eMigrate before recruiting from India**; missions verify them, and an FE found at fault is placed in a "Prior Approval Category". [Primary] (same document)
- The MEA FAQ tells job seekers to check registered and active RAs on eMigrate. [Primary] [MEA FAQ for intending emigrants](https://www.mea.gov.in/issues-of-intending-emigrants)

### 1.2 Registration fee, security and validity

- Application fee ₹25,000 (₹10,000 under the reduced-security route) under Rule 7(2); renewal fee ₹25,000 under Rule 9A (Form II-A). [Secondary — consolidated text] [Emigration Rules on Indian Kanoon](https://indiankanoon.org/doc/33613791/)
- Security (Rule 8, substituted by the Emigration (Amendment) Rules 2023, G.S.R. 907(E), 22 December 2023): a bank guarantee or insurance of **₹50 lakh** valid for 8.5 years; or a **reduced security of ₹8 lakh**, in which case the RA may recruit only **100 workers** during the registration period, with further tranches of 100 workers each needing another ₹8 lakh. [Secondary] [TeamLease RegTech summary](https://teamleaseregtech.com/updates/article/28668/emigration-amendment-rules-2023/), [Indian Kanoon](https://indiankanoon.org/doc/33613791/)
- **Validity of the certificate — [Unverified].** The consolidated text reads "initially for a period of ten years" renewable for ten years (Rule 9, no amendment date shown); the 1983 original text said three years ([Refworld](https://www.refworld.org/legal/decreees/natlegbod/1983/en/14440)); commercial sites cite five years. Product consequence: always record the expiry date printed on the certificate and re-check the active-RA list on eMigrate.

### 1.3 Maximum service charge an RA may collect from an emigrant (current figure)

- **₹30,000 maximum**, with a receipt (Rule 25, as substituted by the Emigration (Amendment) Rules 2017, G.S.R. 1510(E), 14 December 2017). [Secondary — consolidated text and summary] [Indian Kanoon](https://indiankanoon.org/doc/33613791/), [The Dollar Business summary](https://in.thedollarbusiness.com/news/emigration-rules-1983-amended/51559)
- Indian missions state the cap as **"Rs. 30,000 + GST (18%)"**. The Embassy of India, Doha page carrying this advisory was last updated on 5 November 2026, so we treat ₹30,000 plus GST as the current figure. [Primary] [Embassy of India, Doha advisory](https://www.indianembassyqatar.gov.in/whats_new?id=MjM1)
- What the cap covers, per the 2017 summary: candidate scouting and selection, advertising, **trade test fees**, certificate attestation, domestic travel and lodging for interviews, the annual cost of the enhanced bank guarantee, foreign-employer cancellation charges, and office running costs. Outside the cap: visa fees, pre-employment medicals, air tickets, pre-departure boarding and lodging, and GST; the summary says the excluded items other than GST are borne by the foreign employer. [Secondary] [The Dollar Business](https://in.thedollarbusiness.com/news/emigration-rules-1983-amended/51559)
- Collection only by digital payment or bank draft (no cash); an undertaking on ₹100 notarised stamp paper; a display board at the RA's premises showing the maximum charge, payment mode, PBBY charges and pre-departure orientation information. [Secondary] (same sources)
- No later amendment to the cap was found. [Assessment]
- **Conflict to note:** this cap *permits* charging workers, while ILO guidance and several destination countries say recruitment costs belong to employers (§6, §7). [Assessment]

### 1.4 Advertising by recruiting agents

- RAs must issue only genuine and factually correct advertisements and file copies with the Protector of Emigrants / Protector General of Emigrants (Rule 10(1)(xi) and (xiv)(g)–(h)). [Secondary — consolidated text] [Indian Kanoon](https://indiankanoon.org/doc/33613791/)
- Registered agents display their licence number at their office and in their advertisements, including newspaper and social-media ads. [Primary] [Embassy of India, Doha](https://www.indianembassyqatar.gov.in/whats_new?id=MjM1)

### 1.5 ECR / ECNR and emigration clearance

- Holders of **ECR (Emigration Check Required)** passports need emigration clearance (EC) from a PoE, through eMigrate, when going abroad **for employment** to the designated ECR countries. Passports not endorsed ECR are treated as ECNR and do not need EC; ECR holders travelling for other purposes do not need EC either. [Primary] [MEA FAQ](https://www.mea.gov.in/issues-of-intending-emigrants)
- **The 19 ECR countries** (April 2026): Afghanistan, Bahrain, Indonesia, Iraq, Jordan, Kuwait, Lebanon, Libya, Malaysia, Oman, Qatar, Saudi Arabia, Iran, South Sudan, Sudan, Syria, Thailand, United Arab Emirates and Yemen. **EC for Libya and Yemen is currently suspended.** [Primary] [MEA overview, 21-04-2026](https://www.mea.gov.in/images/pdf/01-Overview-of-work-of-Overseas-Employment-21-04-2026.pdf)
  - Older MEA pages give 17 or 18 countries; use the latest list and keep it as admin-managed data. [Primary, conflicting older pages]
- Who gets an ECR endorsement: generally passport holders who have not passed matriculation (Class 10) or cannot prove it. A secondary explainer lists ECNR categories including Class 10 pass and above, people over 50, certain income-tax payers, recognised professionals, qualified nurses, seafarers, and holders of a two-year NCVT/SCVT certificate or a three-year polytechnic diploma — relevant because many ITI-trained welders may be ECNR. [Secondary] [BankBazaar explainer](https://www.bankbazaar.com/passport/ecr-ecnr-status.html) — the official ECNR category list was not confirmed from an MEA page. [Unverified]
- ECNR holders going to ECR countries may register on eMigrate voluntarily; a 2018 advisory to make this mandatory was put in abeyance. [Primary] [MEA overview](https://www.mea.gov.in/images/pdf/01-Overview-of-work-of-Overseas-Employment-21-04-2026.pdf)

### 1.6 Women workers and domestic workers

- In direct recruitment, the foreign employer must deposit a bank guarantee equivalent to **US$2,500 for each woman worker holding an ECR passport** with the Indian mission. [Primary] (MEA overview)
- Recruitment of Indian women domestic workers is restricted to state-government recruiting agencies; the list includes Overseas Manpower Company Andhra Pradesh Ltd (OMCAP) and Telangana Overseas Manpower Company Ltd (TOMCOM). [Primary] (MEA overview)

### 1.7 Pravasi Bharatiya Bima Yojana (PBBY)

- **Mandatory insurance for all ECR-category workers going to ECR countries for employment**: cover of ₹10 lakh for accidental death or permanent disability plus hospitalisation, repatriation and other benefits, at a premium of ₹275 (two years) or ₹375 (three years). eMigrate checks the policy at the time of EC. [Primary] (MEA overview)

### 1.8 Pre-departure orientation (PDOT)

- The Indian programme is called **Pre-Departure Orientation Training (PDOT)**. It is run by MEA with the Ministry of Skill Development and Entrepreneurship under the Pravasi Kaushal Vikas Yojana, with NSDC as implementing agency, and covers language, culture, do's and don'ts, the emigration process and welfare measures. [Secondary] [Insights on India, 2019-02-05](https://www.insightsonindia.com/2019/02/05/pre-departure-orientation-programme/)
- MEA says it educates workers about illegal channels "including through" PDOT. [Primary] (MEA overview)
- Reported as a free, one-day (about 8-hour) certified training aimed at workers bound for ECR countries, with an online version launched on 7 April 2021. [Secondary/Unverified — search summaries; the MSDE page returned HTTP 403]
- **Whether PDOT is mandatory is unconfirmed**: some district-level notices describe it as required, a 2019 report as voluntary. [Unverified]
- Our schema calls this "PDOS" (`mobilisation_records.pdosCompleted`). Indian sources call it PDOT; labels should say PDOT. [Assessment]

### 1.9 Minimum referral wages

- MEA fixes **minimum referral wages (MRW)** per worker category for each of the 19 ECR countries; once fixed, no employer from that country can hire Indian workers below the MRW. [Primary] (MEA overview)

### 1.10 Grievances and illegal agents

- **Pravasi Bharatiya Sahayata Kendra (PBSK)**: 24x7 multilingual helpline in 11 languages including Telugu, Hindi and English — toll-free **1800 11 3090**; +91-11-26885021 (chargeable, for overseas callers); WhatsApp **+91 74283 21144**; email **helpline@mea.gov.in**. Grievances about ECR-country employment can also be logged on eMigrate. [Primary] (MEA overview)
- RAs facing complaints get show-cause notices and must settle; registration certificates can be revoked. [Primary] (MEA overview)
- **3,505 illegal agents had been notified on eMigrate as of 9 April 2026.** [Primary] (MEA overview)
- Missions warn that unregistered agents operate through Facebook, WhatsApp and SMS, overcharge workers by Rs 2–5 lakh, and that such recruitment violates the Act and amounts to human trafficking (MEA's characterisation). Valid offers need a contract signed by the foreign employer, the agent and the worker, on an employment visa, not a tourist visa. [Primary] [Embassy of India, Doha](https://www.indianembassyqatar.gov.in/whats_new?id=MjM1)

### 1.11 Watch item: Overseas Mobility (Facilitation and Welfare) Bill, 2025

- MEA published a draft to **replace the Emigration Act 1983**, with comments due by 7 November 2025. [Primary] [MEA bill page](https://www.mea.gov.in/overseasmobilitybill2025.htm)
- Draft contents (our reading of the draft PDF): an Overseas Mobility and Welfare Council; **accreditation of "Overseas Placement Agencies"** under rules (s.14); procedures for categories of foreign employers (s.17); an **Integrated Information System**, which may require categories of emigrants to furnish information and will include information on citizens departing, even when declared voluntarily (s.18); penalties for agencies of **₹5–20 lakh per violation** (s.20), doubled or with cancellation for repeats within three years (s.21); "emigrant" defined as a citizen **not below 18** (s.2(g)). The draft does not itself set a fee cap; that would come through rules. [Primary] [Draft PDF](https://www.mea.gov.in/images/pdf/Overseas-Mobility-2025.pdf)
- Status: a parliamentary committee report presented on 17 March 2026 said the bill had "remained pending" and urged introduction. [Secondary] [The Tribune, 2026-03-17](https://www.tribuneindia.com/news/india/parliamentary-panel-tells-govt-to-prepare-formal-strategic-document-that-articulates-foreign-policy-objectives). It is not among the bills passed or introduced in the Monsoon Session (20 July–13 August 2026). [Secondary] [SCC Online recap](https://www.scconline.com/blog/post/2026/08/21/parliament-monsoon-session-2026-key-acts-bills/). **The Emigration Act 1983 remains the law.**

---

## 2. India: Digital Personal Data Protection Act 2023 and DPDP Rules 2025

### 2.1 Status and commencement

- Act enacted 11 August 2023. Rules notified as **G.S.R. 846(E), dated 13 November 2025** (the Gazette text); PIB announced them on 14 November 2025. [Primary] [DPDP Rules 2025, Gazette text (English copy)](https://dpdpa.com/DPDP_Rules_2025_English_only.pdf), [PIB backgrounder, 2025-11-17](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- **Rules commencement** (Rule 1): Rules 1, 2 and 17–21 (definitions, Data Protection Board) on publication; **Rule 4 (consent managers) one year after publication**; **Rules 3 and 5–16, 22 and 23 eighteen months after publication**. [Primary] (Gazette text)
- **Act commencement** (notified 13 November 2025): ss. 1(2), 2, 18–26, 35, 38–43, 44(1) and 44(3) immediately; ss. 6(9) and 27(1)(d) (consent managers) after one year; ss. 3–5, 6(1)–(8) and (10), 7–17, 27 (except 27(1)(d)), 28–34, 36–37 and **44(2)** after eighteen months. [Secondary] [AZB & Partners, 2025-11-14](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)
- Practical dates: consent-manager provisions **about 13–14 November 2026**; substantive duties **about 13–14 May 2027**. Sources differ by a day depending on the Gazette publication date. [Secondary] [MirvoLegal, reviewed 2026-09-20](https://www.mirvolegal.com/insights/dpdp-rules-2025-compliance-timeline/)
- MeitY consulted in January–February 2026 on cutting the 18-month window to 12 months (commentary reads it as aimed mainly at significant data fiduciaries and large companies). Trackers found **no notified amendment** as of September 2026. [Secondary] [Chambers / S.S. Rana, 2026-02-23](https://chambers.com/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs), [MirvoLegal](https://www.mirvolegal.com/insights/dpdp-rules-2025-compliance-timeline/)
- Data Protection Board: a four-member, digital-first Board per PIB; MeitY invited applications for Chairperson and Members on 6 May 2026; trackers reported **no appointments as of mid-October 2026**. [Primary — PIB backgrounder; Secondary] [DAPRO, 2026-10-14](https://dapro.in/blog/data-protection-board-status-2026)

### 2.2 Notice (Act s.5; Rule 3)

- The notice must stand on its own, be in clear and plain language, and include at minimum an **itemised description of the personal data**, the **specified purposes** with a description of the goods, services or uses enabled, and the **link and other means to withdraw consent, exercise rights and complain to the Board**. [Primary] (Rule 3, Gazette text)
- Data principals must be given the option to read the notice in **English or any language in the Eighth Schedule** to the Constitution (s.5(3)); for consents obtained before commencement, a notice must be given as soon as reasonably practicable (s.5(2)). [Secondary — Act text] [DPDP Act s.5](https://www.dpdpa.com/dpdpa2023/chapter-2/section5.html)

### 2.3 Consent and consent managers (s.6; Rule 4)

- Consent must be **free, specific, informed, unconditional and unambiguous with a clear affirmative action**, limited to data necessary for the purpose (s.6(1)); requested in clear and plain language with an English or Eighth Schedule option (s.6(3)); **withdrawable with ease comparable to giving it** (s.6(4)); withdrawal does not affect earlier lawful processing (s.6(5)); after withdrawal the fiduciary and its processors must stop processing within a reasonable time unless another law permits (s.6(6)). [Secondary — Act text] [DPDP Act s.6](https://www.dpdpa.com/dpdpa2023/chapter-2/section6.html)
- A data principal may give, manage, review or withdraw consent through a **consent manager** registered with the Board (s.6(7)–(9)). Registration conditions (First Schedule Part A) include: a company incorporated in India, sufficient capacity, sound financial condition and management, and **net worth of at least ₹2 crore**. [Primary] (Gazette text)

### 2.4 Legitimate uses (s.7) — why we should rely on consent

- Legitimate uses without consent include data voluntarily provided for a specified purpose where the person has not objected (s.7(a)) and processing "for the purposes of employment" or safeguarding the employer (s.7(i)). [Secondary — Act text] [DPDP Act s.7](https://www.dpdpa.com/dpdpa2023/chapter-2/section7.html)
- Whether s.7(i) covers a marketplace's processing of *job seekers* (who are not yet employees) is unclear. **We recommend notice-and-consent for every marketplace purpose** (discoverability, sharing with employers, partner submissions, overseas processing, marketing, analytics) and using s.7(a) only for narrowly user-initiated actions, after counsel review. [Assessment]

### 2.5 Rights and grievance timelines

- Rights: information about processing (s.11), correction, completion, updating and erasure (s.12), grievance redressal (s.13) and nomination (s.14); data principals also have duties (s.15). [Primary — PIB backgrounder lists the rights]
- Fiduciaries must publish **how to make a rights request** and which identifiers are needed (Rule 14(1)–(2)) and publish their **grievance response period, which may not exceed 90 days** (Rule 14(3)). PIB summarises this as requests for access, correction, updating or erasure being addressed **within 90 days**. [Primary] (Gazette text; PIB backgrounder)
- Fiduciaries must publish the business contact details of the DPO (if any) or a person who can answer questions, and mention them in **every** response to a rights request (Rule 9; s.8(9)), and run an effective grievance mechanism (s.8(10)). [Primary; Secondary — Act text] [DPDP Act s.8](https://www.dpdpa.com/dpdpa2023/chapter-2/section8.html)
- Our current defaults — `privacy.data_request_sla_days = 30` — are stricter than the DPDP maximum and match GDPR's one month. Keep them. [Assessment]

### 2.6 Security safeguards and breach notification (s.8(5)–(6); Rules 6–7; CERT-In)

- Minimum safeguards (Rule 6): encryption, obfuscation, **masking** or virtual tokens; access control; **visibility through logs, monitoring and review**; backups and continuity; **retention of such logs and personal data for one year** for detecting and investigating unauthorised access (unless another law requires otherwise); security clauses in processor contracts; organisational measures. [Primary] (Gazette text)
- Breach (Rule 7): tell **each affected data principal without delay** (nature, extent and timing; likely consequences; mitigation; steps they can take; a contact); tell the **Board without delay**, then **within 72 hours** (or longer if the Board allows in writing) give a detailed report covering facts and causes, mitigation, findings about who caused it, remedial measures, and the notices sent to data principals. [Primary] (Gazette text)
- Separately, **CERT-In Directions of 28 April 2022** require specified cyber incidents to be reported to CERT-In **within 6 hours** of noticing them and ICT logs to be kept for a rolling **180 days within India**. [Secondary] [NovoJuris via Legal 500, 2023-01-13](https://www.legal500.com/intelligence/india/media-telecoms-it-entertainment/6-hours-to-report-cyber-incidents-to-cert-in-and-more-compliances)

### 2.7 Retention and erasure (s.8(7)–(8); Rule 8)

- Erase personal data (and have processors erase it) when consent is withdrawn or once the purpose is no longer served, unless the law requires retention (s.8(7)). [Secondary — Act text] [DPDP Act s.8](https://www.dpdpa.com/dpdpa2023/chapter-2/section8.html)
- **Inactivity erasure applies only to listed classes** (Third Schedule): e-commerce entities with at least 2 crore registered users in India, online gaming intermediaries with at least 50 lakh, and social media intermediaries with at least 2 crore. They must erase after **three years** without the person approaching them, with **48 hours' notice** before erasure. [Primary] (Rule 8(1)–(2), Gazette text)
  - We are unlikely to fall in these classes at present; counsel should confirm whether a job marketplace counts as an "e-commerce entity". [Assessment]
- **Minimum retention of processing logs:** every fiduciary must keep personal data, associated traffic data and other logs of processing for **at least one year from the processing**, for the purposes in the Seventh Schedule (State uses and assessment of significant data fiduciaries), then erase them unless other law requires longer (Rule 8(3)). Account deletion must therefore not destroy processing logs younger than one year. [Primary] (Gazette text)

### 2.8 Children's data (s.9; Rules 10 and 12)

- A child is an individual who has not completed 18 years (Act s.2(f); the Rules likewise define an adult as someone who has completed 18, Rule 10(2)(a)). Before processing a child's data the fiduciary must obtain **verifiable consent of a parent** (s.9(1)); must not process data in a way likely to harm a child's well-being (s.9(2)); and **must not track, behaviourally monitor or target advertising at children** (s.9(3)). [Secondary — Act text; Primary — Rule 10] [DPDP Act s.9](https://www.dpdpa.com/dpdpa2023/chapter-2/section9.html), [Gazette text](https://dpdpa.com/DPDP_Rules_2025_English_only.pdf)
- Rule 10: due diligence that the person consenting as parent is an identifiable adult, using reliable identity and age details the fiduciary already holds, or details provided voluntarily or through a virtual token from an authorised entity (DigiLocker is named). [Primary] (Gazette text)
- Exemptions (Rule 12; Fourth Schedule) include **educational institutions, defined to include vocational education**, but only for tracking and behavioural monitoring for their educational activities or children's safety; Part B also allows processing to **confirm a user is not a child**. [Primary] (Gazette text)

### 2.9 Significant data fiduciaries (s.10; Rule 13)

- There is **no numeric threshold**. The government notifies a fiduciary or class as significant considering the volume and sensitivity of data, risk to data principals, sovereignty and integrity, electoral democracy, security of the State and public order (s.10(1)). Obligations: a DPO based in India, an independent data auditor, periodic DPIA and audit (s.10(2)); under Rule 13, an annual DPIA and audit reported to the Board, due diligence on algorithmic software, and localisation of data the government specifies. [Secondary — Act text; Primary — Rule 13] [DPDP Act s.10](https://www.dpdpa.com/dpdpa2023/chapter-2/section10.html)
- Not relevant unless notified, but keep DPIA-ready documentation. [Assessment]

### 2.10 Cross-border transfers (s.16; Rule 15)

- Transfers outside India are allowed unless the government restricts them, subject to any requirements the government sets by order about making data available to foreign States (Rule 15). [Primary] (Gazette text)
- Sharing a candidate's profile with an overseas employer is a cross-border transfer: disclose it in the notice, capture `overseas_processing` consent, and keep a per-country record so a future restriction can be applied quickly. [Assessment]

### 2.11 Penalties

- Up to **₹250 crore** for failing to keep reasonable security safeguards; up to **₹200 crore** each for failing to notify breaches and for breaching children's-data obligations; up to **₹50 crore** for other violations. [Primary] [PIB backgrounder](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)

### 2.12 Transitional: IT Act s.43A and the SPDI Rules 2011

- DPDP s.44(2) omits s.43A of the IT Act ([Act text](https://www.dpdpa.com/dpdpa2023/chapter-9/section44.html)) but only commences with the 18-month group (§2.1). Until then the **IT (Reasonable Security Practices and Sensitive Personal Data or Information) Rules 2011** continue to apply in our reading: a published privacy policy, consent for sensitive personal data (passwords, financial details, health, biometrics and others), and a **grievance officer who must redress grievances within one month**. [Secondary; Assessment] [Rules text (PRS)](https://prsindia.org/files/bills_acts/bills_parliament/2011/IT_Rules_2011.pdf)

### 2.13 What this means for our consent ledger, privacy requests and analytics

- **Consent ledger** (`recordConsent`, `consent_records`): one append-only record per purpose with policy version and source; never bundle purposes; withdrawal on the same screen and in one step; on withdrawal, stop the processing and the processors' processing (for example, unshare from employers, stop WhatsApp) within a defined time. Add a `consent_manager` source when consent managers start operating. [Assessment]
- **Notices:** a standalone notice for each collection point (sign-up, profile discoverability, application, partner submission, overseas processing, analytics), versioned via `privacy.policy_version`, available in English, Hindi and Telugu. [Assessment]
- **Privacy requests** (`data_requests`): published request channels; identity verification; response within our 30-day SLA (statutory ceiling 90 days); every response includes the DPO/contact details; erasure honours legal holds (`retentionExceptions`) and keeps processing logs for at least one year. Types already include access, export, correction, deletion, consent withdrawal, objection and nomination. [Assessment]
- **Analytics:** consent-gated, pseudonymous, no personal data in events; **no tracking, behavioural monitoring, heatmaps or session insights for users under 18**; honour withdrawal immediately; Clarity and GA4 stay behind explicit consent. [Assessment]
- **Children:** collect date of birth at sign-up; under-18 accounts need verifiable parental consent before any processing beyond confirming age; exclude minors from employer search for overseas jobs. [Assessment]
- **Breach runbook:** a breach register in the Command Centre; notifications to users without delay, the Board within 72 hours, CERT-In within 6 hours, and EU supervisory authorities within 72 hours where GDPR applies (§8). [Assessment]

---

## 3. IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021, as amended

### 3.1 Why they apply

- We store and transmit records on behalf of users — employer job posts, candidate profiles and messages — which makes us an intermediary for that content under the IT Act, alongside our role as a data fiduciary. Significant-social-media-intermediary duties apply only above a notified user threshold and are unlikely to apply. [Assessment; threshold not verified]

### 3.2 Grievance and takedown timelines

| Obligation | Before 20 Feb 2026 | Since 20 Feb 2026 | Source |
|---|---|---|---|
| Acknowledge a user complaint | 24 hours | 24 hours (not reported as changed) | [Secondary] [Trilegal, 2021-03-02](https://trilegal.com/knowledge-repository/information-technology-rules-2021/) |
| Resolve a complaint to the grievance officer (Rule 3(2)(a)(i)) | 15 days | **7 days** | [Secondary] [Argus Partners](https://www.argus-p.com/updates/updates/update-overview-of-the-it-intermediary-amendment-rules-2026/), [S.S. Rana](https://ssrana.in/articles/government-notifies-information-technology-amendment-rules-2026/), [Cyril Amarchand Mangaldas, 2026-02-11](https://www.cyrilshroff.com/wp-content/uploads/2026/02/Client-Alert-Summary-on-SGI-Amendments.pdf) |
| Complaints about prohibited content under Rule 3(1)(b) | 72 hours | **36 hours** | (same) |
| Remove content exposing private areas, nudity, sexual acts, impersonation or morphed images, after a complaint | 24 hours | **2 hours** | (same) |
| Remove unlawful content on actual knowledge (court order or government notice, Rule 3(1)(d)) | 36 hours | **3 hours** | (same) |
| Appeal to a Grievance Appellate Committee (Rule 3A) | Appeal within 30 days of the grievance officer's decision; the committee endeavours to resolve appeals within 30 calendar days | Unchanged | [Primary] [GAC FAQ](https://gac.gov.in/CMSData/FAQS); [Secondary] [Internet Freedom Foundation, 2026-08-27](https://internetfreedom.in/hc-directs-gac-to-decide-an-appeal-in-30-days-is-there-a-capacity-issue/) |

- The 2026 amendment (notified 10 February 2026, effective 20 February 2026) also regulates "synthetically generated information"; that part matters little to us because we have no AI features, but our terms should still prohibit deceptive synthetic content. [Secondary] (Argus Partners)
- One commentary reads the 7-day figure as an acknowledgement deadline; most read it as the resolution deadline. The Gazette text was not accessible to us (certificate error). [Unverified detail]
- Under the SPDI Rules (§2.12) the grievance officer has one month and under DPDP up to 90 days, but the IT Rules' **7 days** is the shortest applicable limit for complaints about content and user conduct. [Assessment]

---

## 4. GST on recruitment and manpower services

- **Classification:** heading **9985 "Support services"**, which includes employment services such as permanent placement (998512), contract staffing (998513), temporary staffing (998514) and other employment and labour supply services (998519). [Secondary] [busy.in SAC 998512](https://busy.in/sac-code-998512/), [TaxClue, updated 2026-08-18](https://taxclue.in/guide/gst-on-labour-contractor) — check the full list against the official scheme of classification. [Unverified]
- Reverse charge applies to security services, not to general staffing or placement, which are forward-charge supplies. [Secondary] [TaxClue](https://taxclue.in/guide/gst-on-labour-contractor)
- **Rate: 18%** — under Notification 11/2017-Central Tax (Rate), heading 9985 entry (iii) "support services other than" tour operators and certain e-commerce housekeeping attracts 9% CGST (plus 9% SGST, or 18% IGST inter-state). [Secondary] [GSTGyaan, heading 9985 (last updated 2022-08-01)](https://gstgyaan.com/cgst-rate-on-support-services-heading-9985). Guides state the September 2025 rate rationalisation kept these services at 18%. [Secondary] [TaxClue](https://taxclue.in/guide/gst-on-manpower-services)
- Some advisers classify recruitment fees under heading 9983 instead; the rate is 18% either way. [Secondary] [TaxClue](https://taxclue.in/guide/gst-on-manpower-recruitment)
- **Invoices:** B2B tax invoices show the HSN/SAC code; Notification 78/2020-Central Tax (from 1 April 2021) sets the digits by turnover, and summaries show 6-digit SAC for services. [Secondary] [GST Council notification PDF](https://www.gstcouncil.gov.in/sites/default/files/2024-05/notfctn-78-central-tax-english-2020.pdf), [IRIS summary](https://irisgst.com/for-taxpayer-with-turnover-upto-rs-5-cr-mention-4-digit-hsn-code-and-for-turnover-above-rs-5-cr-mention-6-digit-hsn-code/). Our `invoice_lines` table already has an HSN/SAC field.
- **Services to overseas employers:** section 157 of the Finance Act 2026 omitted IGST Act s.13(8)(b), so the place of supply of intermediary services now follows the recipient's location; most commentary treats this as effective from Presidential assent on **30 March 2026**. Recruitment services to a foreign employer may therefore be **zero-rated exports** (under a Letter of Undertaking) if all export conditions in IGST Act s.2(6) are met — broadly: supplier in India, recipient outside India, place of supply outside India, payment in convertible foreign exchange (or INR where RBI permits), and the parties not merely establishments of one person. [Secondary] [Grant Thornton, 2026-04-04](https://www.grantthornton.in/insights/articles/gst-on-intermediary-services/); s.2(6) list is our summary. [Assessment]
- **Training and testing fees** (courses, trade tests) were not researched in depth; rates and any skill-scheme exemptions must be confirmed by a chartered accountant before paid courses or testing invoices go live. [Unverified]
- Seller details already default to Andhra Pradesh (state code 37) in `commercial.seller_details`; the GSTIN is blank until the business supplies it. Never print a GSTIN that has not been verified. [Assessment]

---

## 5. Contract labour and the labour codes

- **The four labour codes took effect on 21 November 2025**, consolidating 29 central labour laws; central rules were published in draft on 30 December 2025 and states are notifying their own rules. [Secondary] [DLA Piper, updated 2026-02-09](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/government-of-india-notifies-the-labour-codes-ushers-a-new-era-of-compliances); PIB release of 21 November 2025 (copy) [labour.gov.in](https://labour.gov.in/sites/default/files/pib2192463.pdf) (HTTP 403 to our fetcher).
- **The Contract Labour (Regulation and Abolition) Act 1970 has been consolidated into (and replaced by) the Occupational Safety, Health and Working Conditions (OSH) Code 2020.** Contract-labour provisions now apply where **50 or more** contract workers were engaged on any day in the preceding 12 months (previously 20, s.45); contractors at that size need a licence (s.47), valid five years (s.48); contract labour in **core activities** is prohibited except in listed situations; the definition of contract labour now includes inter-state migrant workers. [Secondary] [DLA Piper](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/government-of-india-notifies-the-labour-codes-ushers-a-new-era-of-compliances), [Khanals guide](https://khanals.in/guides/contract-labour-registration-and-licence/)
- **Andhra Pradesh** notified its final OSH Rules on **7 August 2026** (G.O.Rt.No.146), covering contractor licensing and renewal; the draft routed licence applications through the Meeseva portal (Form XIII). [Secondary] [Lexplosion](https://lexplosion.in/andhra-pradesh-government-notifies-the-occupational-safety-health-and-working-conditions-andhra-pradesh-rules-2026/), [SGCMS](https://www.sgcms.com/regulatory-updates/final-labour-codes-andhra-pradesh/)
- **Relevance to manpower supply:** when Venkat Sai (or a partner) supplies workers to a client establishment on contract, it acts as a contractor and the client as principal employer; licensing, wage payment and welfare duties attach at the thresholds above. Capture contractor licence details for domestic bulk-supply contracts and for staffing partners. [Assessment]
- **Gig and platform work:** the Code on Social Security 2020 recognises gig and platform workers and requires listed **aggregators** to contribute 1–2% of annual turnover, capped at 5% of amounts paid to such workers (s.114). Whether and when these contributions are operative is reported inconsistently. Get advice before turning the `talent.freelance` feature into a marketplace where Venkat Sai intermediates paid gig work. [Secondary] [PRS bill summary](https://prsindia.org/files/bills_acts/bills_parliament/2020/Bill%20Summary%20-%20The%20Code%20on%20Social%20Security,%202020_For%20Upload.pdf); [Unverified status]

---

## 6. ILO General Principles and Operational Guidelines for Fair Recruitment

- Publication of 22 May 2019 combining the 2016 principles and the 2018 definition of recruitment fees and related costs. They are **non-binding guidance** for governments, social partners and businesses. [Primary] [ILO publication page](https://www.ilo.org/publications/general-principles-and-operational-guidelines-fair-recruitment-and), [PDF](https://www.ilo.org/sites/default/files/wcmsp5/groups/public/%40ed_protect/%40protrav/%40migrant/documents/publication/wcms_536755.pdf)
- **General principle 7:** "No recruitment fees or related costs should be charged to, or otherwise borne by, workers or jobseekers." [Primary] (PDF)
- **Recruitment fees** cover recruiting, referral and placement services, which could include advertising, disseminating information, arranging interviews, submitting documents for government clearances, confirming credentials, organising travel and placement. [Primary] (PDF, definition paras 9–10)
- **Related costs** — when initiated by an employer, recruiter or their agent, required to secure employment, or imposed during recruitment: medical costs; insurance (including migrant welfare funds); **costs for skills and qualification tests**; costs for required **training and orientation, including pre-departure orientation**; equipment; travel and lodging (including for training, interviews and consular appointments); and administrative costs (passports, visas, background checks, permits and similar). [Primary] (PDF, para 12)
- Exceptions may only be set by the competent national authority after consulting workers' and employers' organisations, in the workers' interest, limited to specified categories and services, and **disclosed before the job is accepted** (para 11). Bribes, kickbacks, bonds and collateral are never legitimate (para 15). [Primary] (PDF)
- **Gap with Indian law:** Rule 25 lets an RA charge a worker up to ₹30,000 plus GST, explicitly including trade-test fees (§1.3). ILO guidance treats those as costs the employer should bear. [Assessment]

---

## 7. GCC rules on recruitment fees for workers

Unofficial translations and summaries; counsel in each country must confirm. Domestic-worker regimes differ from private-sector labour law in every country.

| Country | Main rule | Who may charge the worker | Notes | Sources |
|---|---|---|---|---|
| **United Arab Emirates** | Federal Decree-Law No. 33 of 2021, Article 6 | **The employer may not charge** the worker recruitment and employment fees and costs, or collect them from him, directly or indirectly; recruitment or employment mediation needs a MoHRE licence. Commentary says licensed agencies may not charge candidates either [Secondary] | Domestic workers are governed by a separate law (not reviewed) | [Secondary — Lexis Middle East English translation, third-party copy](https://corporatetaxuae.com/uploads/DecreeLaw_33_2021_pdf.pdf); [MoHRE copy](https://www.mohre.gov.ae/assets/download/e82f7872/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments_638990571068264034.pdf.aspx) (did not load for us); [CareerPro explainer](https://careerpro.ae/do-recruitment-agencies-charge-candidates-in-dubai/) |
| **Saudi Arabia** | Labour Law, Article 40 | **Employer bears** recruitment fees, iqama and work-permit fees and renewals (and late fines), change-of-profession fees, exit and re-entry visas, and the return ticket; a new employer bears transfer fees; the worker pays the return trip only if unfit for work or leaving without a legitimate reason | Labour Law amended in 2024 — confirm the current text; for domestic workers, 2025 ministry rules reportedly bar employers from collecting fees [Secondary] | [Primary — MHRSD article](https://www.hrsd.gov.sa/en/knowledge-centre/articles/64434-0); [ARY News, Oct 2025](https://arynews.tv/saudi-arabia-employer-employee-rights-obligations-guide-oct-2025) |
| **Qatar** | Labour Law No. 14 of 2004, Article 33 | **No licensed recruiter may charge** the recruited worker recruitment fees, expenses or other costs | Employers may not deduct such costs from pay [Secondary] | [Secondary — GLMM summary](https://gulfmigration.grc.net/law-no-14-of-2004-issuing-the-labor-law/); [UNODC text copy](https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf); [Recruitment Advisor, Qatar](https://www.recruitmentadvisor.org/law/qa/relevant-legislation-migrant-workers-qatar) |
| **Kuwait** | Private Sector Labour Law No. 6 of 2010, Article 10; Domestic Workers Law No. 68 of 2015 | Private sector: charging recruitment fees to workers is **not explicitly prohibited**; Article 10 says the procedures, documents and fees set by ministerial resolution are paid by the employer. Domestic workers: employer pays agency fees, which cannot be deducted from wages | Sources conflict in emphasis; treat as unresolved | [Secondary — Recruitment Advisor](https://www.recruitmentadvisor.org/law/kw/relevant-national-legislation-migrant-workers-recruitment-kuwait); [ILO factsheet, Dec 2023](https://www.ilo.org/media/481861/download) |
| **Oman** | Labour Law, Royal Decree 53/2023, Article 31; Ministerial Decision 390/2026 | **Nobody**: recruiting non-Omani workers needs a licence, and charging recruited workers any amount for employing them is prohibited; from **1 January 2027** recruitment offices must not collect any amounts or fees from recruited workers | MD 390/2026 also requires an OMR 5,000 guarantee for offices [Secondary] | [Secondary — decree.om English translation](https://decree.om/2023/rd20230053/); [Times of Oman, 2026-10-24](https://timesofoman.com/article/178331-oman-sets-new-regulatory-framework-for-recruiting-non-omani-manpower); [ILO factsheet, Dec 2023](https://www.ilo.org/media/481851/download) |
| **Bahrain** | Labour Law No. 36 of 2012; LMRA rules | Charging recruitment fees to workers is **not explicitly prohibited** by law; employers may not deduct visa-related costs from salary | The government rejected a proposed cap on domestic-worker recruitment fees [Secondary, date uncertain] | [Secondary — ILO factsheet, Dec 2023](https://www.ilo.org/media/363821/download); [MRRORS guide](https://www.mrrors.org/documents/Know-Your-Rights_Bahrain_LabourLaw_asofSep17.pdf); [News of Bahrain](https://www.newsofbahrain.com/bahrain/106201.html) |

- The Indian cap (§1.3) applies to Indian RAs whatever the destination; it does not make a charge lawful where the destination country prohibits it, and employers' codes often forbid any worker fee. [Assessment]

---

## 8. GDPR and EU users

- **Applicability (Art. 3(2)):** we have no EU establishment, so GDPR applies only if we **offer goods or services to individuals in the EU** or **monitor their behaviour in the EU**. GDPR Recital 23 says mere accessibility of a website is not enough, while factors such as the use of a language or currency generally used in a member state, or mentioning customers or users in the EU, can show an intention to offer services there; EDPB Guidelines 3/2018 (final version, 12 November 2019) elaborate the test. Our first-party analytics and heatmaps on EU visitors could amount to monitoring. [Primary] [GDPR, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [EDPB Guidelines 3/2018](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en)
- **If it applies:** appoint an EU representative (Art. 27) unless processing is occasional and low-risk; keep records of processing (Art. 30); a lawful basis for each purpose (Art. 6); extra conditions for special categories such as health (medical fitness) and biometrics (Art. 9); child consent age 16 unless a member state sets 13–15 (Art. 8); transparency (Arts. 13–14); rights within one month (Arts. 12, 15–22); breach notice to the supervisory authority within **72 hours** (Art. 33) and to individuals without undue delay when high-risk (Art. 34); DPIA for high-risk processing (Art. 35); cookie consent under the ePrivacy rules. [Primary] [GDPR, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- **Transfers:** India is **not** on the European Commission's adequacy list, so EU personal data sent to India needs safeguards such as standard contractual clauses (Art. 46). [Primary] [European Commission adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)
- **EU employers recruiting through us** are controllers for their own processing; whether Venkat Sai acts as processor or independent controller in each flow must be settled in contracts (Art. 28 terms where we process on their behalf). [Assessment]

---

## 9. Product rules derived from this

Priority: **P0** before launch of the affected feature; **P1** before scale or before the statutory date; **P2** improvement.

### Fair recruitment and fees

1. **P0 — No recruitment fees from workers, anywhere in the platform.** Neither Venkat Sai, partners nor employers may charge candidates for recruitment or related costs as defined by the ILO (skills tests, medicals, insurance, orientation, travel, visas, documents) for any job or placement handled through the platform. Candidate payments are allowed only for voluntary training that is not a condition of any application, offer or placement. *Basis: §6, §7; golden rule 2. Where: commercial (no candidate-side prices on recruitment), `partner_agreements`, terms of use.*
2. **P0 — Employer pays for employer-required trade tests.** A `skill_assessments` record linked to a requirement or application has an employer or Venkat Sai payer, never the candidate. *Basis: §1.3, §6. Where: `/employer/requirements`, `/admin/assessments`.*
3. **P0 — Zero-fee declarations and checkpoints.** Partners accept a zero-fee clause in their agreement and confirm it on each submission; candidates are asked "Has anyone asked you to pay for this job?" at offer and before travel; a "yes" opens a grievance and pauses the partner's submissions pending review. *Basis: §1.10, §6. Where: `/recruiter/submissions`, `/talent/applications`, `support_tickets`.*
4. **P1 — Never present the statutory cap as an allowed fee.** Candidate-facing copy says not to pay anyone, explains how to verify an agent on eMigrate and how to report; it does not advertise ₹30,000 as permitted. *Basis: §1.3, §1.10. Where: public site, People Portal help.*

### Overseas recruitment compliance (India)

5. **P0 — Overseas requirements only through registered channels.** Overseas requirements involving recruitment in India may be assigned only to partners with a **verified, unexpired eMigrate RA certificate**, or handled by Venkat Sai under its own certificate, or by a foreign employer registered on eMigrate recruiting directly. The business must confirm whether Venkat Sai holds a certificate before it recruits for overseas employment as an agent. *Basis: §1.1. Where: `partner_licences`, `partner_assignments`, approvals.*
6. **P0 — Verify agent certificates properly.** Record certificate number, holder name, issue and expiry dates as printed, security category (₹50 lakh, or reduced ₹8 lakh with 100-worker tranches) and the date of the eMigrate registry lookup; warn as a reduced-security agent approaches its tranche cap; alert before expiry. *Basis: §1.2. Where: `partner_licences.details`, licence-expiry task.*
7. **P0 — Screen against illegal-agent notices** before approving a partner and periodically after. *Basis: §1.10. Where: `/admin/organizations?type=recruitment_partner`.*
8. **P0 — Agent registration on overseas ads.** Overseas jobs advertised by or for an RA display the agent's name and certificate number. *Basis: §1.4. Where: `jobs`, public job pages.*
9. **P0 — Emigration-clearance gate.** For ECR passport holders going to an ECR country, mobilisation cannot move to `travel_booked` until emigration clearance is granted and a PBBY policy is recorded; destinations with suspended clearance (currently Libya and Yemen) are blocked. The ECR country list is admin-managed data. *Basis: §1.5, §1.7. Where: `mobilisation_records.emigrationClearanceStatus`, checklist.*
10. **P1 — Minimum referral wage check.** Offers for ECR countries are checked against admin-maintained MRW tables; below-MRW offers are blocked pending staff review. *Basis: §1.9. Where: `offers`, Command Centre settings.*
11. **P0 — Proper contract and visa.** Before departure, upload the employment contract signed by the foreign employer, the agent (where used) and the worker; never mobilise on a tourist or visit visa. *Basis: §1.10. Where: mobilisation checklist.*
12. **P0 — No recruitment of women domestic workers to ECR countries** through the platform unless via a notified state agency. *Basis: §1.6. Where: job categories, requirement validation.*
13. **P1 — Pre-departure orientation and helpline.** Track PDOT as a checklist item (labelled PDOT), and show every overseas candidate the PBSK helpline and eMigrate grievance options in their language. *Basis: §1.8, §1.10. Where: `/talent`, mobilisation views.*
14. **P1 — Keep licence types configurable** so "Overseas Placement Agency" accreditation can be added if the 2025 bill becomes law. *Basis: §1.11.*

### Privacy (DPDP, SPDI, GDPR)

15. **P0 — Standalone, versioned notices** at each collection point with itemised data, purposes, withdrawal link, rights and Board complaint route, in English, Hindi and Telugu. *Basis: §2.2.*
16. **P0 — Granular consent, easy withdrawal.** One ledger record per purpose; no bundling; withdrawal in one step from `/talent/privacy` and the account pages; downstream sharing stops on withdrawal. *Basis: §2.3.*
17. **P1 — New consent purposes** for sharing assessment results with employers, contacting references, background verification, and parental consent (or a dedicated guardian-consent record). *Basis: §2.3, §2.8.*
18. **P0 — Rights and grievances.** Publish request channels and the DPO/contact on the site and in every response; respond within the configured SLA (default 30 days, statutory ceiling 90 days under DPDP; one month under GDPR); identity verification before disclosure. *Basis: §2.5, §8.*
19. **P0 — Erasure with retention floors.** Erase on withdrawal or end of purpose, but retain processing and security logs for at least one year (DPDP Rule 6 and 8(3)) and ICT logs 180 days in India (CERT-In); record legal holds. *Basis: §2.6, §2.7.*
20. **P2 — Dormant-profile policy.** Even though the three-year inactivity rule does not appear to bind us, notify and anonymise long-dormant candidate profiles after a published period. *Basis: §2.7 (data minimisation).*
21. **P0 — Children.** Age gate from date of birth; under-18 users need verifiable parental consent; no analytics tracking, heatmaps, session insights or marketing for minors; minors excluded from overseas job matching and employer search for overseas roles. *Basis: §2.8; draft bill s.2(g).*
22. **P0 — Breach runbook and register.** Notify affected users without delay, the Board without delay and with a detailed report within 72 hours, CERT-In within 6 hours for specified incidents, and EU authorities within 72 hours where GDPR applies. *Basis: §2.6, §8. Where: Command Centre (privacy module).*
23. **P0 — Masking and access logs** stay mandatory for contact details and documents (`logDataAccess()`); they are part of the DPDP minimum safeguards. *Basis: §2.6.*
24. **P1 — Cross-border register.** Record transfers to overseas employers by destination country so a government restriction can be enforced quickly; use standard contractual clauses for EU data. *Basis: §2.10, §8.*
25. **P1 — Consent-manager ready.** Accept consent and withdrawal arriving through a registered consent manager once they operate (expected from about November 2026). *Basis: §2.3.*

### Intermediary obligations

26. **P0 — Grievance officer and timelines.** Publish the grievance officer; acknowledge within 24 hours; resolve within **7 days**; content complaints within 36 hours; intimate or impersonating content within 2 hours; actual-knowledge takedowns within 3 hours; tell complainants about the Grievance Appellate Committee route. *Basis: §3. Where: `support_tickets` (grievance types), settings.*
27. **P1 — Terms of use** prohibit fake jobs, fee demands, impersonation and deceptive synthetic media, with reporting on every job and profile. *Basis: §3.*

### Tax and commercial

28. **P0 — GST as data.** 18% on heading 9985 services with the SAC printed on each invoice line; CGST+SGST within Andhra Pradesh, IGST inter-state; zero-rated export treatment only after a chartered accountant confirms the s.2(6) conditions and a Letter of Undertaking is in place. *Basis: §4. Where: `tax_rates`, `invoice_lines`.*
29. **P1 — Confirm training and testing GST** before enabling paid courses or test invoices. *Basis: §4.*

### Labour

30. **P1 — Contractor details for manpower supply.** Domestic bulk-supply contracts and staffing partners record contractor licence details where the OSH Code thresholds apply. *Basis: §5. Where: `employer_contracts`, `partner_licences` (`staffing_licence`).*
31. **P2 — Legal review before a paid gig marketplace** (`talent.freelance`), because of aggregator duties under the Code on Social Security. *Basis: §5.*

### Public claims

32. **P0 — No unverified regulatory claims.** Show a recruiting-agent number, GSTIN or accreditation only from a verified, current record; label Venkat Sai trade-test certificates as Venkat Sai assessments, never as accredited external certifications unless they are. *Basis: §1, §4; golden rule 1.*

---

## 10. Gaps found in the current codebase (for module owners)

These files are owned by other engineers; the research module does not edit them.

| File / setting | Finding | Suggested change |
|---|---|---|
| `src/config/settings.ts` — `privacy.grievance_resolution_days` | Default 15 days reflects the IT Rules before 20 February 2026 | Default 7 days; label it as the IT Rules limit |
| `src/db/schema/operations.ts` — comment above `GRIEVANCE_TYPES` | Cites 15 days, 72 hours and 24 hours | Update to 7 days, 36 hours, 2 hours; add the 3-hour actual-knowledge takedown; make per-type timelines settings, not constants |
| `src/db/schema/recruitment.ts` — `pdosCompleted`, comments | Uses "PDOS" | Use "PDOT (Pre-Departure Orientation Training)" in labels and comments; the column name can stay |
| `mobilisation_records` / checklist | No explicit PBBY policy, MRW check or tri-party contract fields | PBBY insurer, policy reference (masked) and validity; MRW check result; contract file; RA certificate snapshot; FE eMigrate registration reference |
| `src/db/schema/partners.ts` — `PartnerLicenceDetails` | No security category or worker-tranche tracking | Add security type (₹50 lakh / reduced ₹8 lakh), tranche size and count, registry lookup date, illegal-agent screening result |
| `src/db/schema/_constants.ts` — `CONSENT_PURPOSES` | No purposes for assessment-result sharing, reference checks, background verification or parental consent | Add these purposes or a guardian-consent record |
| Candidate onboarding | No parental-consent flow for under-18s seen in the schema or docs (as of 2026-11-07) | Age gate plus parental consent (Rule 10) before processing beyond age confirmation |
| Privacy module | No breach register seen (the module had only `tasks.ts` on 2026-11-07) | Breach register with Board (72 h), CERT-In (6 h) and user-notification tracking |

## 11. Open questions for counsel

1. Does Venkat Sai Welding Works and Testing Center hold an eMigrate recruiting-agent certificate? If not, which overseas activities may it carry out (for example, trade testing for a foreign employer or a registered RA) without one?
2. What is the current validity period of an RA certificate (§1.2)?
3. Is PDOT mandatory for any category of emigrant, and does it have to be completed before emigration clearance?
4. May a Venkat Sai trade test be paid by a registered RA (and recovered within the ₹30,000 cap), or must the foreign employer pay to satisfy destination law and ILO guidance?
5. Is Venkat Sai Global an "e-commerce entity" for the DPDP Third Schedule, and which DPDP legitimate uses (if any) cover marketplace processing of job seekers?
6. Does the 7-day IT Rules limit apply to every grievance or only to those within Rule 3(2)(a)(i)?
7. GST: confirm the SAC for each revenue line (placement fees, subscriptions, credits, trade tests, courses) and export eligibility for foreign employers after the Finance Act 2026.
8. Do Venkat Sai's domestic manpower-supply contracts require a contractor licence under the Andhra Pradesh OSH Rules 2026, and in which other states?
9. Would the freelance or gig feature make Venkat Sai an "aggregator" under the Code on Social Security?
10. For each GCC destination, confirm the current private-sector and domestic-worker fee rules and the 2024–2027 changes noted in §7.
11. Is GDPR triggered by our planned audiences and analytics, and if so, who will act as EU representative?

## 12. Disclaimer

This document is a research summary for product design, prepared without legal qualification. It is not legal, tax or immigration advice, may be incomplete or out of date, and relies in places on unofficial translations and secondary commentary. Venkat Sai Welding Works and Testing Center must have every statement and product rule here **validated by qualified legal counsel in the relevant jurisdictions, and by a chartered accountant for tax matters**, before relying on it, building features that depend on it, or making any public statement about compliance, licences or registrations.
