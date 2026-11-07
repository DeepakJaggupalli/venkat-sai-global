/** Career services a candidate can request (client-safe). Subjects are English for the support team. */
export const CAREER_SERVICES = ["resume_review", "career_counselling", "interview_preparation"] as const;
export type CareerService = (typeof CAREER_SERVICES)[number];

export const CAREER_SERVICE_SUBJECTS: Record<CareerService, string> = {
  resume_review: "Career services: resume review request",
  career_counselling: "Career services: career counselling request",
  interview_preparation: "Career services: interview preparation request",
};
