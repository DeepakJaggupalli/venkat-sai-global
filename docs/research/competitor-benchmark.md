# Competitor benchmark

Research note for Venkat Sai Global. Status: **as of 2026-11-07**. Every link in this document was accessed on **2026-11-07** unless another date is given.

The ten products below are research references, not templates. Nothing here may be copied verbatim (the few short quotes are marked as quotes), and no product's names, layouts, colours, illustrations, copy or other trade dress may be reused. Prices and figures appear only to explain business models. They change often and are never inputs to our own pricing, which is data administered in the Command Centre (see `docs/CONVENTIONS.md` rule 5).

Read together with [Regulatory notes](./regulatory-notes.md): several "do not copy" items below are legal constraints, not preferences.

## Evidence labels

| Label | Meaning |
|---|---|
| **[Official]** | The vendor's own website, help centre or pricing page. It shows what the vendor says it offers, not what it delivers. |
| **[Self-reported]** | A number or ranking the vendor states about itself (users, placements, "#1"). Not independently verified. Never repeat it as fact. |
| **[Secondary]** | Third-party source: news, review or listing sites, a competitor's blog, or government figures as reported by media. |
| **[Unverified]** | We could not confirm it from an accessible primary source on 2026-11-07. Treat it as a lead, not a fact. |
| **[Assessment]** | Our own analysis or opinion. Not a sourced fact. |

AI features are out of scope for Venkat Sai Global. Where a competitor relies on AI (matching, calling agents, AI interviewers, AI proctoring, AI shortlists), it is noted only so the team knows what not to copy and which non-AI pattern to build instead.

## 1. Key takeaways

1. **No product in this set links verified practical skill to safe overseas deployment.** The trades marketplaces (Collars, Skillit) verify credentials and skills but serve the US domestic market. The Indian blue-collar platforms (WorkIndia, Apna) optimise for volume and speed of contact. Skill India Digital Hub issues government-backed credentials but does not run recruitment or mobilisation. Zoho Recruit is a tool with no talent supply. [Assessment]
2. **Trust is the main unmet need in Indian blue-collar and overseas hiring.** Apna launched a recruiter-verification tool in 2025 and cites large job-scam losses. An Indian embassy advisory (page updated 2026-11-05) warns that unregistered overseas agents overcharge workers by Rs 2–5 lakh. Verification plus a zero-fee promise is a stronger position than another job board. [Secondary; notes 3.4 and regulatory notes §1]
3. **Phone-first, vernacular, call- and WhatsApp-led flows are table stakes** for blue-collar candidates in India (WorkIndia, Apna). We should build them with number masking, consent and access logging, not bulk database exports. [Official/Secondary + Assessment]
4. **Employers pay and candidates are free** in every marketplace studied (Collars, Skillit, WorkIndia, Apna, Indeed). Revenue comes from job credits, database or contact credits, sponsored visibility, seats and enterprise services. Our commercial module already models these as entitlements (`job_posts`, `candidate_unlocks`, `featured_jobs`, `team_seats`). [Official]
5. **Training providers want proof of outcomes.** Collars offers schools one verified record of hours, credentials and placements. Internshala and Unstop sell campus reach. Skill India Digital Hub offers verified credentials and QR-code digital CVs. Our Institution portal can do the same, backed by real practical-test evidence. [Official + Assessment]
6. **Power-user recruiting patterns are mature**: projects, Boolean search and shared pipelines (LinkedIn Recruiter), and client, vendor and candidate portals with stage rules (Zoho Recruit). Adopt the patterns, but scope every search to candidates who have opted in to being discovered. [Official + Assessment]
7. **Several common growth tactics conflict with our rules**: unverifiable "#1" claims and placement counters, candidate-paid "placement" courses sold next to job listings, bulk candidate downloads, biometric proctoring and AI agents. [Assessment; see §4.2]

## 2. Feature comparison matrix

Short cells; evidence and links are in §3. "VSG" = Venkat Sai Global.

| Product | Target users | Primary features | Business model | Employer experience | Candidate experience | Differentiating capabilities | Weaknesses / unmet needs | Adopt | Improve | Do not copy |
|---|---|---|---|---|---|---|---|---|---|---|
| **Collars** (US, skilled trades) | Tradespeople; trade employers; trade schools and apprenticeship programmes | Mobile profiles with photo/video portfolio, licences, work history; matching on trade, experience, location, availability; messaging; pipeline; school placement | Free for workers; employer free tier plus enterprise (beta) via sales; school pricing not published | Post jobs, browse profiles with work photos, credentials, pay expectations; track New → Hired | Free app; sees pay before applying; one-swipe apply; growing portfolio | Visual trade portfolios; schools linked to one record of hours, credentials and placements | US only; how "verified" is checked is not explained; no cross-border or mobilisation [Assessment] | Photo/video work portfolio; pay shown up front; simple pipeline | "Verified" backed by issuer checks and Venkat Sai test evidence | Swipe-to-apply for high-stakes overseas jobs; unexplained "verified" badges |
| **Skillit** (US construction) | Craft workers; contractors, specialty trades, unions, staffing firms | Skills-first profiles (skills, certs, equipment, commute, travel, pay); trade assessments; many search filters incl. commute and past employers; map view | Free for workers; employers pay (free starter tier for low volume; enterprise via sales) | Self-serve search and message; enterprise adds workflows, bulk outreach, success team | No résumé; answers job-derived questions once; résumé generated from profile | Trade-specific assessments; validated work history and certifications claimed | Verification method undisclosed; AI-dependent; US only [Assessment] | Structured, job-derived profile questions; commute and relocation fields; assessment scores on profile | In-person practical tests with evidence instead of online quizzes | AI calling assistant; offer-acceptance predictions; opaque scores |
| **WorkIndia** (India blue-collar) | Entry-level and blue-collar job seekers; SME employers | Job posts; candidates call HR directly; employer database with call/SMS/WhatsApp, bulk unlock and export [Unverified] | Employers pay (paid plans); candidates free | Paid plans bring calls from candidates; database contact | Free; call-first apply; regional-language app (8 languages reported in 2020) | Call-first, no-CV flow for low-literacy users | Current features unverifiable (site blocked our fetch); thin verification; database export is a privacy risk [Assessment] | Call/WhatsApp-first contact; very simple vernacular forms | Masked calling through the platform, consent and logging; verified employers only | Bulk export of candidate databases; volume-rewarding pay-per-call |
| **Apna** (India mass hiring) | Freshers, blue/grey-collar, women, 10th/12th pass; MSMEs and enterprises | City/role job search; app with direct HR contact and application tracking; job credits; database credits for unlocks and bulk downloads; bulk WhatsApp invites; recruiter verification tool | Employer credit packs (INR, GST invoice); custom enterprise plans; candidates free | Dashboard; 15-day job validity; credits; WhatsApp outreach; enterprise ATS integration, multi-login, branding | Unlimited applications; HR contacts candidate; alerts | Hyperlocal scale; WhatsApp workflows; anti-scam recruiter check | Scam exposure in the market; credit model rewards volume; bulk downloads; heavy AI upsell [Assessment] | Transparent credit packs as data; recruiter verification and scam education | Employer verification before any candidate contact; consented WhatsApp templates only | Excel bulk download of profiles; AI calling agent; "#1" claims |
| **LinkedIn Recruiter** | Corporate talent teams; staffing firms; occasional hirers (Lite) | 40+ filters plus Boolean; projects; pipeline; InMail; profile sharing with hiring managers/clients; ATS/CRM integrations; reports | Per-seat licences; prices not published; AI add-on | Power-user sourcing and team collaboration | Passive candidates contacted via InMail | Network scale; Boolean search; project-based collaboration | White-collar bias; poor fit for workers without profiles or email; no trade verification [Assessment] | Projects (lists per requirement), saved searches, structured feedback; Boolean for staff | Search only over consented, discoverable candidates; consent-aware outreach | AI agents; outreach to non-consenting profiles; seat-only pricing |
| **Indeed** | All job seekers and employers | Job search; free and sponsored jobs; company pages with reviews; CV search (Smart Sourcing); screener questions; video interviews; hiring events | Pay for engagement (clicks or started applications) within budgets; subscriptions; free posts subject to review | Dashboard, budgets, company page, events | Free search and apply; alerts; reviews; event registration | Scale; employer reviews; events platform | Sponsored ranking can bury organic listings; reviews need heavy moderation; not trade-verified [Assessment] | Hiring events with slot booking; screener questions; company pages | Company pages only for verified employers; "featured" always labelled | Opaque click auctions; anonymous reviews at launch; auto-declining everyone not advanced |
| **Internshala** | Students and freshers; employers; college placement (T&P) teams | Internships and jobs; certification and placement-assistance courses; résumé builder; employer chat; assignment tool | Employers: one free post a month, paid plans; candidates: paid courses and degrees | Post jobs/internships; filters; assignments; chat | Apply to internships; buy courses; webinars | Internship plus training funnel; T&P logins | Candidate-paid courses next to job access can blur "pay for a job" [Assessment]; large self-reported placement figures | Assignment-based screening; internship templates; T&P accounts | Keep training payments fully separate from job access; outcomes only from verified data | "Placement assistance" upsells tied to jobs; discount-banner selling; unverifiable counters |
| **Unstop** | Students and early talent; employers; campuses | Campus hiring; hackathons and competitions; proctored assessments; branding and talent community; postings; AI agents | Demo-led enterprise sales; prices not published | Branded challenges, assessments, ATS integrations | Compete, register, build profile | Competition-led employer branding; campus reach claims | Tech/white-collar skew; biometric proctoring is a privacy risk [Assessment]; AI-heavy | Campus drives with registration; skill challenges | Practical, in-person challenges at our centre with human assessors | Face/voice biometric proctoring; Aadhaar collection for tests; AI interviewers |
| **Zoho Recruit** | Corporate HR teams; staffing agencies | ATS plus recruitment CRM; career site; multi-board posting; parsing; workflows; candidate, client, vendor and hiring-manager portals; reports | Per-recruiter SaaS; free plan (1 active job); paid tiers; vendor-portal add-on | Full ATS configurable per process | Candidate portal; career-site applications | Configurable stage rules; client and vendor portals for staffing | A tool, not a network: no talent supply, verification or mobilisation [Assessment] | Vendor (partner) submission portal; employer review portal; rule-based stage gates | Compliance gates at stage changes (licence verified, consent captured, zero-fee declared) | Configuration-heavy UX for small employers; AI assistant |
| **Skill India Digital Hub** (Government of India) | Learners; training providers; assessment agencies; employers; government schemes | Course discovery, enrolment, assessment, certification; Aadhaar eKYC; digitally verified credentials; QR digital CV; multilingual | Public digital infrastructure, free to users | Employers find talent through digital CVs | Free courses; verified credentials; digital CV | Government-backed credentials; scheme integration | Generic across sectors; practical results from private centres not represented unless affiliated; no mobilisation tracking [Assessment] | Public credential verification (code + QR); multilingual UI; shareable digital CV | Practical evidence behind each credential (procedure, assessor, photos) | Mandatory Aadhaar sign-up; any implied government affiliation |

## 3. Product notes

### 3.1 Collars — collars.io

- Positioning: a hiring platform for the skilled trades (construction, electrical, plumbing, HVAC, manufacturing, transportation, specialised services). [Official] [homepage](https://www.collars.io/)
- Workers: free mobile app; the site states "Collars is always free for tradespeople". Workers build a profile with photos, video, certifications, licences and work history that grows over time. [Official] [homepage](https://www.collars.io/), [applicants](https://collars.io/applicants)
- Matching is described as based on trade, experience, location and availability; workers can see pay before applying and apply with a swipe. [Official] [homepage](https://www.collars.io/)
- Employers: desktop tool to post jobs, view applicant profiles with work photos, credentials, pay expectations and availability, message candidates, and track candidates in one pipeline from "New" to "Hired". [Official] [homepage](https://www.collars.io/) (employer section; see also [employers](https://collars.io/employers))
- Pricing: employer "Essentials" tier is free with no credit card; an "Enterprise" tier (labelled beta) adds multiple users and priority support via sales. No worker fees are mentioned. [Official] [pricing](https://collars.io/pricing)
- Training providers: pitched as placement for students with employer partners, keeping hours, credentials and placements in "one verified record". The page does not explain how verification works or what it costs. [Official; mechanism Unverified] [trade schools](https://collars.io/trade-schools)
- Scale claim "17,000+ users" appears on the homepage. [Self-reported]
- Geography: the site references Chicago-area events and testimonials and no other markets. [Assessment]
- Lesson for VSG: the "portfolio plus one verified record" idea fits a welding centre well, but our "verified" must be backed by evidence we hold (test records, issuer checks). [Assessment]

Sources accessed 2026-11-07.

### 3.2 Skillit — skillit.com

- Positioning: a US construction hiring network for craft professionals; the homepage says joining is free "for craft professionals, always". [Official] [homepage](https://skillit.com/)
- Employer plans: "Craft Hire" for employers hiring up to about 30 craft workers a year (free to start, pause any time) and "Craft Hire Enterprise" for national-scale hiring with workflows, bulk outreach, onboarding and a customer-success team (contact sales). [Official] [solutions](https://www.skillit.com/solutions), [what we do](https://www.skillit.com/what-we-do)
- Profiles replace résumés: skills, certifications, work history, equipment operated, willingness to travel or work per diem, commute range, relocation and pay expectations; workers can take a Skillit assessment. [Official] [worker profile article](https://www.skillit.com/blog/every-craft-worker-needs-a-skillit-profile)
- Employer search: filters for commute distance, salary, skills and previous employers, a map view, and profiles showing "validated work history", "verified certifications" and assessment scores. The verification method is not described. [Official; method Unverified] [ENR contractors article](https://www.skillit.com/blog/construction-hiring-craft-labor-sourcing-enr-companies)
- "Dynamic Onboarding" (announced 2026-09-29): questions are generated from partners' job descriptions so workers answer once, can upload a résumé to speed up, and subjective traits are excluded. [Official press release] [Construction Dive press release](https://www.constructiondive.com/press-release/20260929-skillit-launches-dynamic-onboarding-replacing-generic-trade-questions-with-1/)
- Business model per a third-party listing: workers free; employer purchasing options include seats, blocks of guaranteed hires or a flat fee, with a 90-day money-back guarantee and custom enterprise pricing; network size given as 200,000+ craft workers. This conflicts in part with Skillit's own "free to get started" tier. [Secondary] [DataDrivenAEC listing](https://datadrivenaec.com/tools/skillit)
- References: search-engine summaries attribute to Skillit a claim that it verifies professional references; we could not find this on any page we fetched. [Unverified]
- AI: an assistant that places outreach calls/texts and schedules interviews, and weekly AI shortlists, per the same listing. Out of scope for VSG. [Secondary]
- Homepage statistics ("52%" of large builders hire through Skillit; "72 hours" to interview) are not sourced. [Self-reported]

Sources accessed 2026-11-07.

### 3.3 WorkIndia — workindia.in

- Access: the homepage and pricing page returned HTTP 403 to our fetcher on 2026-11-07, so current features could not be checked first-hand. Everything below is from search-engine snippets or third parties. [Unverified]
- Search snippet of the official pricing page: employers reach candidates through a "Database" feature by call, SMS or WhatsApp, and can bulk-unlock and export candidate profiles. [Unverified — snippet of [pricing page](https://www.workindia.in/pricing/)]
- A June 2026 guide (written by competitor Internshala) says posting is not free, there are three plans, paid plans bring "unlimited calls directly from interested candidates", and claims a database of over 2 crore candidates in 750 cities. [Secondary; competitor-authored] [Internshala guide, updated 2026-06-19](https://internshala.com/blog/employer-how-to-post-job-on-workindia/)
- A 2020 news report (as summarised by search) described the candidate app as launched in eight regional languages, free for candidates, with recruiters paying per candidate call from a wallet. The article itself returned HTTP 403. [Secondary, dated 2020; Unverified] [YourStory, Jan 2020](https://yourstory.com/2020/01/recruitment-startup-workindia-blue-collar-jobs-swiggy-zomato)
- Third-party listings quote plans starting around INR 2,350 and disagree on whether any free tier exists. [Secondary; conflicting] [TechImply](https://www.techimply.com/profile/workindia), [SaaSworthy](https://www.saasworthy.com/product/workindia/pricing)
- One review site reports buyers finding the packages unclear. [Secondary] [SoftwareSuggest](https://www.softwaresuggest.com/workindia)
- Lesson for VSG: copy the call-first simplicity, not the open database. Use masked numbers and log every reveal. [Assessment]

Sources accessed 2026-11-07.

### 3.4 Apna — apna.co

- Candidates: job search by title, experience and city; category pages for freshers, part-time, work-from-home, women and 10th/12th pass candidates; app promises unlimited applications, HRs contacting candidates directly and application tracking; free job alerts. [Official] [homepage](https://apna.co/)
- Claims such as "India's #1 job platform", 5 crore+ job seekers and 7 lakh+ MSMEs are unverified marketing. [Self-reported]
- Employer products listed: unlimited-posting plan, AI calling agent, "smart" job posts, a hyperlocal candidate database and bulk WhatsApp outreach ("WhatsApp Fast Recruit"); separate enterprise offering. [Official] [employer site](https://employer.apna.co/)
- Pricing displayed on 2026-11-07 (promotional, INR): 3 job credits for 30 days at ₹1,949; 6 credits for 90 days at ₹3,649; 13 credits for 180 days at ₹7,099; each job stays live 15 days; custom plans add an account manager, multimedia WhatsApp invites, ATS integration, multiple logins, branding and up to 360-day validity; GSTIN can be added to invoices. [Official] [pricing](https://employer.apna.co/pricing)
- Credits come in three kinds: job-posting credits, database credits (profile unlocks and bulk downloads) and AI job-posting credits. [Official] [help centre: credits](https://employer-help-centre.apna.co/support/solutions/articles/1060000124751-what-are-the-credits-)
- Trust: in September 2025 Apna launched "Apna Safety", a recruiter-verification check that also flags scam patterns such as registration fees, deposits and training charges; it reports verifying 146,000+ recruiters in a pilot and cites an industry estimate of about ₹5,100 crore lost to job scams. [Secondary, figures Self-reported] [Business Today, 2025-09-25](https://www.businesstoday.in/technology/news/story/apnaco-launches-ai-powered-tool-apna-safety-to-curb-job-scams-in-india-during-festive-hiring-495735-2025-09-25)
- The homepage shows ministry and agency logos under "Proud to support" without explaining the relationship. [Official; relationship Unverified]
- Lesson for VSG: transparent, data-driven credit packs and explicit scam education are worth adopting; bulk downloads and AI calling are not. [Assessment]

Sources accessed 2026-11-07.

### 3.5 LinkedIn Recruiter — business.linkedin.com/talent-solutions

- Tiers: Recruiter (teams hiring at scale), Recruiter Lite (20 search filters, third-degree network access, 30 InMails a month) and Recruiter Professional Services Plus for staffing firms. [Official] [Recruiter page](https://business.linkedin.com/talent-solutions/recruiter)
- Search: "40+ advanced filters, keywords, and Boolean", including languages spoken and network relationships. [Official] (same page)
- Projects keep saved candidates in one place for a team; hiring managers or clients can be shown profiles for feedback; the full history with a candidate is visible to the team. [Official] (same page)
- Outreach: up to 150 InMails per seat per month in Recruiter. [Official] (same page)
- Integrations with ATS, CRM and email; usage and funnel reports, custom reports and competitor benchmarking. [Official] (same page)
- Pricing is not published and depends on company size and seats; an AI "Hiring Assistant" is sold as an add-on (out of scope for VSG). [Official] (same page)
- Weakness for our audience: built around professional profiles and InMail, which most blue-collar and overseas-bound workers do not use. [Assessment]

Sources accessed 2026-11-07.

### 3.6 Indeed — indeed.com

- Employer accounts are free; posts usually go live within 24–48 hours after review; sponsored jobs stay visible longer, appear in alerts and unlock extra tools; billing is described as paying when candidates engage. [Official] [Indeed for employers (India)](https://in.indeed.com/hire)
- Pricing FAQ: some jobs (for example from career-site feeds or ATS) are sponsored-only; invoices reflect interactions such as clicks or started applications; budgets have market-specific minimums; Free, Standard and Premium plans exist. [Official] [pricing](https://www.indeed.com/hire/pricing) (served the India page to us)
- Pricing history: Indeed moved from pay-per-click towards pay-per-application in 2022 and later to pay-per-started-application in some markets. [Secondary] [SHRM](https://www.shrm.org/ResourcesAndTools/hr-topics/talent-acquisition/pages/indeed-shifts-pricing-to-pay-per-application.aspx), [Indeed Australia pricing](https://au.indeed.com/employers/pricing-results)
- Company pages show reviews and culture; premium options add video and branding. [Official] [Indeed for employers](https://in.indeed.com/hire)
- Smart Sourcing gives CV-database search and invitations; screener questions filter applicants; Indeed Interview runs browser-based video interviews; the dashboard can auto-decline candidates not moved forward. [Official] (same page)
- Hiring events: employers can run in-person or virtual events; job seekers register, answer questions and pick a slot on Indeed for events scheduled there. [Official] [job seeker help: virtual hiring events](https://uk.indeed.com/help/job-seekers/articles/12961222772877-what-are-virtual-hiring-events), [employer hiring events](https://ie.indeed.com/employers/hiring-events-2-2)
- Secondary sources disagree on 2025–2026 rules (free-post caps, daily minimums); we did not verify them. [Unverified]
- Lesson for VSG: events and screener questions are worth adopting; anonymous reviews and click auctions are not, at least at launch. [Assessment]

Sources accessed 2026-11-07.

### 3.7 Internshala — internshala.com

- Audience: students and freshers (internships, fresher jobs, courses) with a separate login for employers and college training-and-placement (T&P) teams. [Official] [homepage](https://internshala.com/)
- Training: short certification courses and career-track "placement courses" sold with "placement assistance" (no guarantee stated), online degrees with EMI, study-abroad listings, a résumé builder and free webinars; a time-limited "FLAT 83% OFF" course banner was live on 2026-11-07. [Official] (same page)
- Employer guide: one free job or internship post a month with access to at least the first 20 applications; paid subscriptions for more; an assignment tool, chat with candidates, filters, and AI résumé ranking and AI interviews. [Official] [how to hire on Internshala](https://internshala.com/blog/employer-how-to-hire-on-internshala/)
- Claims include a 3.2 crore+ talent pool, 28 lakh+ placements and partner logos (Skill India, NSDC, AICTE and others). [Self-reported]
- Employer pricing is not shown on the homepage; third-party figures conflict. [Secondary; conflicting] [Flexiple review](https://flexiple.com/reviews/internshala)
- Weakness relative to our rules: paid courses promoted alongside job access invites the perception that paying improves job chances. [Assessment]
- Lesson for VSG: adopt assignment-based screening and T&P accounts; keep course payments completely separate from applications. [Assessment]

Sources accessed 2026-11-07.

### 3.8 Unstop — unstop.com/employers

- Campus and early-talent hiring with a claimed reach of 20,000+ campuses. [Self-reported] [employers page](https://unstop.com/employers)
- Hackathons, case competitions, simulations and hiring challenges; one case study reports over 1.1 lakh registrations for a single event. [Official/Self-reported] (same page)
- Assessments: a large question bank and "360° proctoring" with face scan and voice biometrics, device detection, screen-share blocking and Aadhaar verification. [Official] (same page)
- Branding solutions and talent communities; job and internship posting; ATS functions and integrations with major ATS products. [Official] (same page)
- A suite of AI agents (sourcing, screening, interviewing, calling, scheduling) — out of scope for VSG. [Official]
- Pricing is not published; demo-led sales. [Official]
- Weakness relative to our rules: biometric proctoring and Aadhaar capture create high privacy risk and are unnecessary for practical trade testing done in person. [Assessment]
- Lesson for VSG: competitions and campus drives work as employer-branding tools; for trades, run them as practical events at an assessment centre. [Assessment]

Sources accessed 2026-11-07.

### 3.9 Zoho Recruit — zoho.com/recruit

- Cloud ATS combined with a recruitment CRM for HR teams and staffing agencies; web and mobile apps. [Official] [Zoho Recruit](https://www.zoho.com/recruit/)
- Job marketing: branded careers site and posting to "75+" job boards and social media. [Official] (same page)
- Automation: blueprints, workflows and custom functions for communications, offer approvals, résumé parsing and interview scheduling. [Official] [automation](https://www.zoho.com/recruit/recruitment-automation.html)
- Collaboration portals for hiring managers, clients, vendors and candidates. [Official] [Zoho Recruit](https://www.zoho.com/recruit/)
- Pricing (corporate edition): a free plan with 1 active job per recruiter licence; Standard (10 active jobs, careers site, assessments, reports); Enterprise (20 active jobs, candidate and staffing portals, blueprints, advanced analytics); vendor portal as a paid add-on; local taxes extra. Per-seat amounts were not shown to our fetcher. [Official] [pricing](https://www.zoho.com/recruit/pricing.html)
- 200+ integrations; 15-day trial without a credit card; an AI assistant (out of scope for VSG). [Official] [Zoho Recruit](https://www.zoho.com/recruit/)
- Lesson for VSG: Zoho's client and vendor portals map directly onto our Employer and Partner portals; add the compliance gates Zoho leaves to configuration. [Assessment]

Sources accessed 2026-11-07.

### 3.10 Skill India Digital Hub (SIDH) — skillindiadigital.gov.in

- Access: the site is a JavaScript application; our fetcher received only its title and tagline, and PIB press pages returned HTTP 403. Features below come from a reproduced launch release and secondary reports. [Unverified first-hand]
- Launched on 13 September 2023 by the Ministry of Skill Development and Entrepreneurship as digital public infrastructure for skilling, education, employment and entrepreneurship. [Secondary, reproducing the launch release] [National Skills Network, 2023-09-14](https://www.nationalskillsnetwork.in/union-minister-shri-dharmendra-pradhan-launched-skill-india-digital-platform-to-enable-skilling-for-all/)
- Features at launch: Aadhaar-based eKYC, digitally verified credentials, a QR-code digital CV for employers, multiple Indian languages, industry-relevant courses, job opportunities and entrepreneurship support, mobile-first design. [Secondary] (same source)
- NSDC describes SIDH as a mobile-first platform that brings ministries' and states' skilling schemes together, with a learning-management system tracking a learner from registration to certification aligned to current qualification packs. [Official — NSDC] [NSDC Digital](https://nsdcindia.org/digital)
- A 2024 report lists portable verified credentials, a learning-management system and apprenticeship opportunities. [Secondary] [ThePrint, 2024-07-31](https://theprint.in/india/indias-skill-india-digital-hub-launched/2200743)
- Scale reported for February 2026 (citing the ministry in the Lok Sabha): over 1.5 crore candidates, 7,000+ training providers, 70+ assessment agencies and 68,000+ employers and industry partners. [Secondary report of official figures] [Careers360](https://news.careers360.com/jayant-chaudhary-launches-badhna-hai-toh-yahan-judna-hai-campaign-skill-india-digital-hub-sidh-1-5-crore-users)
- Whether private training and assessment centres can list courses or issue credentials on SIDH, and on what terms (for example NSDC or sector-skill-council affiliation), was not established. [Unverified]
- Lesson for VSG: public credential verification and a QR digital CV are expected features; do not imply any government affiliation and do not require Aadhaar at sign-up. [Assessment]

Sources accessed 2026-11-07.

## 4. Implications for Venkat Sai Global

### 4.1 What to adopt and improve, by module

Routes and tables named below exist in `src/config/navigation.ts` and `docs/DATA_MODEL.md`. Items marked "proposal" need an owner decision.

#### Public site (`/`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| Public credential check (SIDH) | A public page where anyone enters a certificate or trade-test code and sees issuer, holder initials, test type, date and status (active, revoked, expired) | Show the procedure or standard reference and whether it is a Venkat Sai assessment or an accredited external certification | `certificates.verificationCode`, `skill_assessments`; route is a proposal (for example `/verify/[code]`) |
| Company pages (Indeed) | Employer pages for verified organisations only | No anonymous reviews at launch; show verification date and "hiring overseas" flag | `/employers`, `company_profiles`, `organizations.status` |
| Hiring events (Indeed, Unstop) | Events and hiring drives with registration | Trade-test days at the assessment centre as events | `/events`, CMS `events`, `campus_drives` |
| Anti-scam education (Apna) | A plain-language "We never charge candidates" page and banner | Explain how to check a recruiting agent on eMigrate and how to report fee demands (see regulatory notes §1) | CMS page; links from every overseas job |
| Transparent job information (all) | Job pages show who is hiring and how verified the information is | Show the recruiting agent's eMigrate registration number on overseas jobs advertised by an agent | `jobs.infoSource`, `jobs.verifiedEmployer`, `partner_licences` |

#### People Portal (`/talent`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| Visual work portfolio (Collars) | Photo/video portfolio of welds, fabrication and site work | Link portfolio items to verified test evidence where it exists | `candidate_portfolio_items`, `/talent/profile` |
| Skills-first, job-derived questions (Skillit) | Structured profile fields (trade, processes, positions, equipment, commute, relocation, overseas willingness) instead of free-text CVs | Ask only what open requirements need; never ask for protected attributes | `candidate_skills`, `candidate_profiles` |
| Pay shown before applying (Collars) | Salary visible by default on jobs | Show currency of the job, never assume INR; flag overseas offers below the applicable minimum referral wage (regulatory notes §1.9) | `jobs.salary*`, `salaryVisible` |
| Call-first, vernacular apply (WorkIndia, Apna) | OTP sign-in, short forms, English/Hindi/Telugu, voice-friendly copy | Masked calls through the platform and consented WhatsApp updates; no public phone numbers | `auth.phone_otp`, i18n namespaces, `notifications.whatsapp` |
| Application tracking (Apna) | Clear stage labels written for candidates | Add the overseas mobilisation timeline (documents → medical → visa → emigration clearance → insurance → orientation → travel → arrival) in the candidate's language | `workflow_stages.candidateLabel`, `mobilisation_records`, `mobilisation_checklist_items` |
| Verified credentials, QR CV (SIDH) | Shareable profile link and QR for verified certificates | Candidate controls what is shared; every employer view logged | `certificates`, `candidate_privacy_settings`, `logDataAccess()` |
| Scam pattern warnings (Apna) | "Did anyone ask you for money?" check at offer and mobilisation | Creates a grievance and pauses the partner's submissions until reviewed | `support_tickets.isGrievance`, `partner_submissions` |

#### Employer Portal (`/employer`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| Job credits and database credits (Apna, WorkIndia) | Plans and credits as data (job posts, featured jobs, contact unlocks) | Unlocks only for candidates who allowed discovery; unlock reveals contact, never bulk export | `ENTITLEMENT_KEYS`, `profile_unlocks`, `/employer/billing` |
| Projects and Boolean search (LinkedIn) | Talent lists per requirement; saved searches; Boolean-style operators for power users | Search limited to `visibility` and `candidate_privacy_settings`; blocked organisations respected | `talent_lists`, `/employer/candidates`, `/employer/lists` |
| Pipeline (Collars, Zoho) | Kanban pipeline on the standard workflow | Structured interview feedback; screener answers flag, never auto-reject | `/employer/pipeline`, `job_screening_questions.knockoutAnswer` |
| Bulk requirements (none in set does this well) [Assessment] | Multi-trade workforce requests with positions per trade | Request a Venkat Sai trade test for shortlisted candidates as part of the requirement; employer pays for it | `requirement_requests`, `requirement_lines`, `skill_assessments.requirementId` |
| Video interviews and events (Indeed) | Interview scheduling with modes incl. trade test | Candidate confirmation and reminders in their language | `interviews` |
| Bulk WhatsApp invites (Apna) | Invitations through approved WhatsApp templates | Only to candidates with `whatsapp_updates` consent; delivery logged | `notification_templates.whatsappTemplateName`, consent ledger |

#### Recruitment Partner Portal (`/recruiter`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| Vendor portal (Zoho) | Assigned requirements and candidate submissions | Duplicate detection and attribution windows; consent record required before acceptance | `partner_assignments`, `partner_submissions`, `duplicate_flags`, `candidate_attributions` |
| Recruiter verification (Apna) | Verified partner badge | Verify the India recruiting-agent certificate on eMigrate, track expiry and security category, screen against MEA's illegal-agent notices (regulatory notes §1) | `partner_licences`, `/recruiter/documents`, `/admin/organizations?type=recruitment_partner` |
| Performance reports (LinkedIn, Zoho) | Partner scorecards | Include complaints, fee-demand reports and candidate drop-off, not only volume | `/recruiter/performance`, `partner_profiles.qualityScore` |
| Settlements (none in set) | Partner settlements with line items | Pay partners only from employer-side revenue; never from candidate money | `partner_settlements` |

#### Institution and Training Portal (`/institution`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| One verified record for schools (Collars) | Per-student record of attendance, assessments, certificates and placements | Placement outcomes marked verified only with evidence | `attendance_records`, `assessment_scores`, `certificates`, `placement_outcomes.verified` |
| Campus hiring (Unstop, Internshala) | Campus drives with registrations and linked jobs | Practical trade challenges at the centre as drives | `campus_drives`, `campus_drive_registrations` |
| Assignment tool (Internshala) | Practical tasks and projects in course assessments | Human assessors; no biometric proctoring | `course_assessments` (type practical/project) |
| Digital credentials (SIDH) | Certificates with verification codes | Issuer scope checked: only organisations Venkat Sai has authorised can issue certificates | `institution_profiles.isAuthorisedCertificateIssuer` |

#### Command Centre (`/admin`)

| Pattern (seen in) | Adopt as | Improve with | Data / route |
|---|---|---|---|
| Reports (LinkedIn, Zoho) | Funnel and source reports | Honest public metrics only from live counts or approved figures with an "as of" date | `/admin/analytics`, `/admin/public-metrics` |
| Stage rules (Zoho blueprints) | Gates at key transitions | Compliance gates: licence verified, consent captured, zero-fee declared, emigration clearance before travel for ECR cases | approvals, `mobilisation_records.emigrationClearanceStatus` |
| Trust and safety (Apna) | Review queue for fee-demand reports and suspicious employers | Partner suspension workflow with audit trail | `/admin/approvals`, `/admin/support`, `audit()` |
| Assessment operations (none in set) | Assessment-centre scheduling and results entry | Evidence files, assessor identity, procedure reference, retest logic | `/admin/assessments`, `assessment_centres`, `skill_assessments` |

### 4.2 Do not copy

| Practice (seen in) | Why not |
|---|---|
| Any candidate-paid access to jobs, "premium" candidate visibility, or courses sold as improving placement chances (Internshala-style upsells) | Breaks golden rule 2 (candidates never pay to see or apply) and fair-recruitment rules (regulatory notes §6–7). |
| Bulk download or export of candidate profiles (Apna database credits, WorkIndia per snippet) | Defeats masking, consent and access logging; high breach and misuse risk under the DPDP Act. |
| AI calling agents, AI interviewers, AI shortlists, offer-acceptance predictions (Apna, Skillit, Unstop, LinkedIn, Zoho, Internshala) | AI is out of scope; opaque automated decisions also raise fairness and accountability issues. |
| Face or voice biometric proctoring; Aadhaar collection for tests or sign-up (Unstop, SIDH) | Disproportionate for our use; practical tests happen in person with human assessors. |
| Self-reported "#1" rankings and user or placement counters that a reader cannot check (seen on Apna, Internshala, Skillit and Collars pages) | Golden rule 1: public numbers only from live counts or approved entries with an "as of" date. |
| Ministry or partner logos shown without explaining the relationship (for example the "Proud to support" logo strip on Apna's homepage) | Our logos require `logo_permissions` evidence and a stated relationship; never imply government affiliation. |
| Anonymous employer reviews at launch (Indeed) | Needs moderation, defamation handling and fraud controls we do not yet have. Revisit later as verified post-placement feedback. |
| Auto-declining everyone not moved forward; knockout auto-rejection (Indeed) | Our rule: knockout answers flag, never auto-reject; candidates get a clear status. |
| Swipe-to-apply for overseas jobs (Collars) | Overseas jobs need informed decisions about contract, wages and destination. |
| Names, layouts, colours, illustrations, slogans or product names of any studied product | Trade dress; Venkat Sai Global is the primary brand everywhere. |

### 4.3 Prioritised differentiators

Ordered by defensibility and by how directly they rest on assets Venkat Sai already has. "Proof before public claims" lists what must exist before marketing copy may mention the differentiator.

1. **Verifiable practical trade-test results from a real welding training and testing centre.**
   - Why defensible: none of the ten products runs physical practical tests; Skillit's assessments are its own and Collars and SIDH rely on credentials issued elsewhere. [Assessment]
   - Build: assessment-centre scheduling; results with procedure or standard reference, position and process (for example plate or pipe positions, SMAW/GTAW), assessor, evidence photos of the welded test pieces; certificate with a public verification code; employer-requested tests linked to a requirement; retest logic; candidate-controlled sharing.
   - Guardrail: a Venkat Sai test is a Venkat Sai assessment. It must not be described as an accredited welder qualification (for example under ISO 9606-1, the international standard for qualification testing of welders, see the [ISO committee page](https://committee.iso.org/standard/54936.html)) unless the test was actually conducted and certified under that standard by an authorised party. The data model already encodes this (`certificates.issuerType`).
   - Proof before public claims: written test procedures, assessor records, evidence retention policy, and real completed assessments. No pass-rate or volume claims until live data exists.
   - Modules: `/admin/assessments`, `/talent/assessments`, `/talent/certificates`, `/employer/requirements`, public verification page (proposal).

2. **Employer-pays fair recruitment, enforced in the product.**
   - Why defensible: marketplaces keep candidates free to apply, but none studied tracks whether anyone in the recruitment chain charged the worker. The Indian rules still let a recruiting agent collect up to ₹30,000 plus GST from an emigrant, while ILO guidance and several GCC laws put recruitment costs on employers (regulatory notes §1.3, §6, §7). [Assessment based on sources]
   - Build: zero-fee declaration in partner agreements and on each submission; "did anyone ask you to pay?" checkpoints at offer and before travel; grievance flow with partner suspension; employer pays for employer-required trade tests, medicals and visas; course fees never linked to applications.
   - Proof before public claims: the policy in partner agreements and terms; the checkpoints live; a working grievance process.
   - Modules: `/recruiter`, `/talent/applications`, `/admin/support`, `partner_agreements`, commercial plans (employer-side only).

3. **Verified recruitment-partner compliance.**
   - Why defensible: Apna verifies recruiters' identity; nobody studied verifies India recruiting-agent registration, expiry, security category or illegal-agent notices. [Assessment]
   - Build: registry lookup of the eMigrate registration certificate, expiry alerts, the reduced-security 100-worker tranche counter, screening against MEA's notified illegal agents, advertisement checks (registration number on overseas ads), complaint history and scorecards.
   - Proof before public claims: verification SOP and records for each partner; never call a partner "verified" before staff verification.
   - Modules: `/recruiter/documents`, `/admin/organizations?type=recruitment_partner`, `/admin/partners`, `partner_licences`.

4. **End-to-end overseas mobilisation tracking.**
   - Why defensible: none of the ten products tracks documents, medicals, visas, Indian emigration clearance, mandatory insurance, pre-departure orientation, travel and arrival. Government systems (eMigrate) serve registered agents and employers, not the worker's own view. [Assessment]
   - Build: mobilisation checklist with responsible party and due dates; emigration-clearance gating for ECR passports to ECR countries; insurance and orientation tracking; minimum-referral-wage check; tri-party contract upload; candidate timeline in English/Hindi/Telugu; post-arrival check-ins; the government helpline shown to every overseas worker.
   - Proof before public claims: coordinators assigned and the workflow used on real placements.
   - Modules: `/admin/mobilisation`, `/talent/applications`, `/employer/offers`, `mobilisation_records`, `mobilisation_checklist_items`.

5. **Multilingual, phone-first candidate experience for Andhra Pradesh and Telangana workers.**
   - Why defensible: WorkIndia and Apna are phone-first but generic; SIDH is multilingual but not a recruitment service. Telugu-first support from a centre in Visakhapatnam is a local advantage. [Assessment]
   - Build: OTP sign-in; Telugu, Hindi and English; short forms; masked calling; consented WhatsApp updates; low-bandwidth pages; in-person help at the Visakhapatnam centre for candidates who need it.
   - Proof before public claims: full translations reviewed by native speakers; accessibility checks at 360px.
   - Modules: `/talent/**`, auth screens, notifications.

6. **One record from training to test to job.**
   - Why defensible: Collars pitches this to schools; we can add in-house practical testing and placement outcomes verified with evidence. [Assessment]
   - Build: course → batch → attendance → assessment → certificate → job match → placement outcome; institution dashboards; employer-visible verified skills.
   - Modules: `/institution/**`, `/talent/training`, `/talent/certificates`.

7. **Honest trust layer.**
   - Why defensible: competitors lean on unverified counters and logos; consistent honesty is hard to copy quickly. [Assessment]
   - Build: public metrics only from live data or approved entries with "as of" dates; verified-employer badges with dates; job information-source labels; logo permissions with evidence.
   - Modules: `/admin/public-metrics`, `public_metrics`, `logo_permissions`, `jobs.infoSource`.

### 4.4 Claims we can and cannot make today

| Can say now (if true in the live product) | Cannot say until evidence exists |
|---|---|
| "Candidates never pay to find or apply for jobs on Venkat Sai Global." | Any number of placements, candidates, employers, partners or countries without a live count or approved entry with an "as of" date. |
| "Trade tests are carried out at our testing centre in Auto Nagar, Visakhapatnam" — only once the assessment workflow is live. | That a Venkat Sai test equals an accredited certification (for example ISO 9606-1) unless it was conducted and certified under that standard. |
| "We check recruiting agents' registration before they can work on overseas requirements" — only once the verification SOP is running. | That Venkat Sai holds any licence or registration (for example an eMigrate recruiting-agent certificate) until the business confirms it and staff record the certificate. |
| "Report anyone who asks you for money for a job." | Testimonials, client logos or success stories without recorded consent and permission. |

## 5. Verification log

| Item | Status on 2026-11-07 |
|---|---|
| WorkIndia homepage and pricing page | HTTP 403 to our fetcher; facts taken from search snippets and third parties; marked [Unverified]. |
| WorkIndia 2020 YourStory article | HTTP 403; facts taken from a search summary; marked [Unverified]. |
| Skill India Digital Hub site | JavaScript app; only title and tagline readable; features from secondary sources. |
| PIB press releases on SIDH | HTTP 403; used secondary reproductions. |
| Skillit "verified professional references" | Seen only in search summaries; not found on fetched pages; [Unverified]. |
| Skillit pricing | Own site says free to start; a third-party listing says no free employer tier; recorded as conflicting. |
| Indeed 2025–2026 free-post caps and minimum budgets | Conflicting secondary sources; not used. |
| Zoho Recruit per-seat prices | Not rendered to our fetcher; plan structure only. |
| Apna price figures | Read from the live pricing page; promotional and subject to change. |
| Collars verification mechanism | Not described on the site; [Unverified]. |
