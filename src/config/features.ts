/**
 * Feature flags / module toggles (client-safe). Stored in `feature_flags`
 * (toggled at /admin/settings/modules); these defaults apply when no row exists.
 * Every portal and optional module must check its flag so Venkat Sai can switch
 * services on and off without a code change.
 */
export const FEATURES = {
  // Portals
  "portal.talent": { default: true, name: "People Portal", category: "Portals" },
  "portal.employer": { default: true, name: "Employer Portal", category: "Portals" },
  "portal.recruiter": { default: true, name: "Recruitment Partner Portal", category: "Portals" },
  "portal.institution": { default: true, name: "Institution & Training Portal", category: "Portals" },

  // Sign-in methods
  "auth.google": { default: true, name: "Google sign-in (requires credentials)", category: "Authentication" },
  "auth.phone_otp": { default: true, name: "Phone OTP sign-in", category: "Authentication" },
  "auth.email_otp": { default: true, name: "Email OTP sign-in", category: "Authentication" },

  // People portal services
  "talent.internships": { default: true, name: "Internships", category: "People Portal" },
  "talent.freelance": { default: true, name: "Freelance, gig and project work", category: "People Portal" },
  "talent.training": { default: true, name: "Training discovery and enrolment", category: "People Portal" },
  "talent.career_services": { default: true, name: "Career services (resume, counselling, interview prep)", category: "People Portal" },
  "talent.overseas": { default: true, name: "Overseas opportunities", category: "People Portal" },
  "services.resume_writing": { default: true, name: "Paid “Prepare my resume” service (/resume-service)", category: "People Portal" },
  "services.resume_online_payments": { default: false, name: "Online payment for the resume service (also needs Razorpay keys and online payments on)", category: "Commercial" },

  // Employer services
  "employer.self_serve_jobs": { default: true, name: "Employers can post jobs themselves", category: "Employer Portal" },
  "employer.candidate_search": { default: true, name: "Candidate database search", category: "Employer Portal" },
  "employer.bulk_requirements": { default: true, name: "Bulk manpower requirements", category: "Employer Portal" },

  // Commercial
  "commercial.subscriptions": { default: true, name: "Plans and subscriptions", category: "Commercial" },
  "commercial.online_payments": { default: false, name: "Online card/UPI payments (requires gateway keys)", category: "Commercial" },

  // Notifications
  "notifications.email": { default: true, name: "Email notifications", category: "Notifications" },
  "notifications.sms": { default: false, name: "SMS notifications (requires provider)", category: "Notifications" },
  "notifications.whatsapp": { default: false, name: "WhatsApp notifications (requires approval + provider)", category: "Notifications" },

  // Analytics
  "analytics.first_party": { default: true, name: "First-party analytics (consent-based)", category: "Analytics" },
  "analytics.heatmaps": { default: true, name: "Click and scroll heatmaps (consent-based)", category: "Analytics" },
  "analytics.clarity": { default: false, name: "Microsoft Clarity session insights (explicit consent)", category: "Analytics" },
  "analytics.ga4": { default: false, name: "Google Analytics 4 (consent mode)", category: "Analytics" },

  // Content
  "content.blog": { default: true, name: "Blog and industry insights", category: "Content" },
  "content.events": { default: true, name: "Events, hiring drives and job fairs", category: "Content" },
  "content.gallery": { default: true, name: "Gallery and videos", category: "Content" },
} as const;

export type FeatureKey = keyof typeof FEATURES;
