/**
 * The platform's default application workflow "Standard recruitment" (spec 8.5), installed by
 * seed.ts. Pure data (client-safe).
 *
 * `name` is the staff / employer pipeline label; `candidateLabel` + `candidateDescription` (and the
 * Hindi / Telugu translations) are what the People Portal shows. Descriptions explain the process
 * only — they make no promises about outcomes or timelines. Translations should be reviewed by
 * native speakers before launch (administrators can edit them, the seed never overwrites edits).
 *
 * `notifyCandidate` is off where a dedicated notification already covers the step (interview
 * scheduled → interview.scheduled, offer issued → offer.issued, application submitted →
 * application.submitted) or where the candidate performed the step themselves (offer accepted,
 * withdrawn), and for internal checkpoints (assessment / interview completed, employer decision).
 * No SLA is seeded: service levels are set by administrators, never assumed.
 */
import type { WorkflowStageCategory, WorkflowStageTranslations } from "@/db/schema/recruitment";

import { STAGE_KEYS } from "./workflow";

export type DefaultStageDefinition = {
  key: string;
  name: string;
  category: WorkflowStageCategory;
  sortOrder: number;
  candidateLabel: string;
  candidateDescription: string;
  candidateTranslations: WorkflowStageTranslations;
  isTerminal: boolean;
  notifyCandidate: boolean;
};

export const DEFAULT_WORKFLOW_KEY = "standard";

type StageInput = Omit<DefaultStageDefinition, "sortOrder" | "candidateTranslations"> & {
  hi: { label: string; description: string };
  te: { label: string; description: string };
};

const stage = (index: number, s: StageInput): DefaultStageDefinition => ({
  key: s.key,
  name: s.name,
  category: s.category,
  sortOrder: (index + 1) * 10,
  candidateLabel: s.candidateLabel,
  candidateDescription: s.candidateDescription,
  candidateTranslations: { hi: s.hi, te: s.te },
  isTerminal: s.isTerminal,
  notifyCandidate: s.notifyCandidate,
});

const STAGES: StageInput[] = [
  {
    key: STAGE_KEYS.submitted,
    name: "Submitted",
    category: "applied",
    candidateLabel: "Application submitted",
    candidateDescription: "We have received your application. The recruitment team will review it.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "आवेदन जमा हुआ", description: "हमें आपका आवेदन मिल गया है। भर्ती टीम इसकी समीक्षा करेगी।" },
    te: { label: "దరఖాస్తు సమర్పించబడింది", description: "మీ దరఖాస్తు మాకు అందింది. నియామక బృందం దీన్ని సమీక్షిస్తుంది." },
  },
  {
    key: STAGE_KEYS.underReview,
    name: "Under review",
    category: "screening",
    candidateLabel: "Under review",
    candidateDescription: "Your profile is being reviewed against the job requirements.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "समीक्षा जारी", description: "नौकरी की आवश्यकताओं के अनुसार आपकी प्रोफ़ाइल की समीक्षा की जा रही है।" },
    te: { label: "సమీక్షలో ఉంది", description: "ఉద్యోగ అవసరాలకు అనుగుణంగా మీ ప్రొఫైల్ సమీక్షించబడుతోంది." },
  },
  {
    key: STAGE_KEYS.shortlisted,
    name: "Shortlisted",
    category: "screening",
    candidateLabel: "Shortlisted",
    candidateDescription: "Your profile has been shortlisted for the next step.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "शॉर्टलिस्ट किया गया", description: "अगले चरण के लिए आपकी प्रोफ़ाइल शॉर्टलिस्ट की गई है।" },
    te: { label: "షార్ట్‌లిస్ట్ చేయబడింది", description: "తదుపరి దశ కోసం మీ ప్రొఫైల్ షార్ట్‌లిస్ట్ చేయబడింది." },
  },
  {
    key: STAGE_KEYS.assessmentPending,
    name: "Assessment pending",
    category: "assessment",
    candidateLabel: "Assessment pending",
    candidateDescription: "A skills or trade assessment is part of the selection process. You will receive the details.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "मूल्यांकन बाकी", description: "चयन प्रक्रिया में कौशल या ट्रेड मूल्यांकन शामिल है। आपको इसका विवरण भेजा जाएगा।" },
    te: { label: "మూల్యాంకనం పెండింగ్‌లో ఉంది", description: "ఎంపిక ప్రక్రియలో నైపుణ్య లేదా ట్రేడ్ మూల్యాంకనం ఉంది. వివరాలు మీకు పంపబడతాయి." },
  },
  {
    key: STAGE_KEYS.assessmentCompleted,
    name: "Assessment completed",
    category: "assessment",
    candidateLabel: "Assessment completed",
    candidateDescription: "Your assessment is complete. The result will be shared when it is available.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "मूल्यांकन पूरा", description: "आपका मूल्यांकन पूरा हो गया है। परिणाम उपलब्ध होने पर साझा किया जाएगा।" },
    te: { label: "మూల్యాంకనం పూర్తయింది", description: "మీ మూల్యాంకనం పూర్తయింది. ఫలితం అందుబాటులోకి వచ్చినప్పుడు తెలియజేయబడుతుంది." },
  },
  {
    key: STAGE_KEYS.interviewScheduled,
    name: "Interview scheduled",
    category: "interview",
    candidateLabel: "Interview scheduled",
    candidateDescription: "An interview has been arranged. Check the interview details and confirm your attendance.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "इंटरव्यू तय", description: "आपका इंटरव्यू तय किया गया है। इंटरव्यू का विवरण देखें और अपनी उपस्थिति की पुष्टि करें।" },
    te: { label: "ఇంటర్వ్యూ షెడ్యూల్ చేయబడింది", description: "మీ ఇంటర్వ్యూ ఏర్పాటు చేయబడింది. ఇంటర్వ్యూ వివరాలు చూసి మీ హాజరును నిర్ధారించండి." },
  },
  {
    key: STAGE_KEYS.interviewCompleted,
    name: "Interview completed",
    category: "interview",
    candidateLabel: "Interview completed",
    candidateDescription: "Your interview is complete. The employer is reviewing the outcome.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "इंटरव्यू पूरा", description: "आपका इंटरव्यू पूरा हो गया है। नियोक्ता परिणाम की समीक्षा कर रहे हैं।" },
    te: { label: "ఇంటర్వ్యూ పూర్తయింది", description: "మీ ఇంటర్వ్యూ పూర్తయింది. యజమాని ఫలితాన్ని సమీక్షిస్తున్నారు." },
  },
  {
    key: STAGE_KEYS.employerDecisionPending,
    name: "Employer decision pending",
    category: "decision",
    candidateLabel: "Awaiting employer decision",
    candidateDescription: "The employer is making a decision. You will be notified when it is made.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "नियोक्ता के निर्णय की प्रतीक्षा", description: "नियोक्ता निर्णय ले रहे हैं। निर्णय होने पर आपको सूचित किया जाएगा।" },
    te: { label: "యజమాని నిర్ణయం కోసం వేచి ఉంది", description: "యజమాని నిర్ణయం తీసుకుంటున్నారు. నిర్ణయం తీసుకున్నప్పుడు మీకు తెలియజేయబడుతుంది." },
  },
  {
    key: STAGE_KEYS.selected,
    name: "Selected",
    category: "decision",
    candidateLabel: "Selected",
    candidateDescription: "You have been selected. The next step is the job offer.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "चयनित", description: "आपका चयन हो गया है। अगला चरण नौकरी का प्रस्ताव है।" },
    te: { label: "ఎంపికయ్యారు", description: "మీరు ఎంపికయ్యారు. తదుపరి దశ ఉద్యోగ ఆఫర్." },
  },
  {
    key: STAGE_KEYS.offerIssued,
    name: "Offer issued",
    category: "offer",
    candidateLabel: "Offer received",
    candidateDescription: "You have received a job offer. Review it and respond before it expires.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "प्रस्ताव मिला", description: "आपको नौकरी का प्रस्ताव मिला है। समय-सीमा से पहले इसे देखें और जवाब दें।" },
    te: { label: "ఆఫర్ అందింది", description: "మీకు ఉద్యోగ ఆఫర్ అందింది. గడువు ముగిసేలోపు దాన్ని పరిశీలించి స్పందించండి." },
  },
  {
    key: STAGE_KEYS.offerAccepted,
    name: "Offer accepted",
    category: "offer",
    candidateLabel: "Offer accepted",
    candidateDescription: "You have accepted the offer. Next, your documents will be prepared for joining.",
    isTerminal: false,
    notifyCandidate: false,
    hi: { label: "प्रस्ताव स्वीकार किया", description: "आपने प्रस्ताव स्वीकार कर लिया है। अब जॉइनिंग के लिए आपके दस्तावेज़ तैयार किए जाएंगे।" },
    te: { label: "ఆఫర్ అంగీకరించారు", description: "మీరు ఆఫర్‌ను అంగీకరించారు. తదుపరి, చేరడానికి మీ పత్రాలు సిద్ధం చేయబడతాయి." },
  },
  {
    key: STAGE_KEYS.documentation,
    name: "Documentation",
    category: "pre_joining",
    candidateLabel: "Documentation in progress",
    candidateDescription: "Your documents are being collected and checked for joining. Complete any items assigned to you.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "दस्तावेज़ प्रक्रिया जारी", description: "जॉइनिंग के लिए आपके दस्तावेज़ एकत्र और जाँचे जा रहे हैं। आपको सौंपे गए काम पूरे करें।" },
    te: { label: "పత్రాల ప్రక్రియ కొనసాగుతోంది", description: "చేరడానికి మీ పత్రాలు సేకరించి తనిఖీ చేయబడుతున్నాయి. మీకు కేటాయించిన అంశాలను పూర్తి చేయండి." },
  },
  {
    key: STAGE_KEYS.mobilisation,
    name: "Mobilisation",
    category: "pre_joining",
    candidateLabel: "Preparing for joining",
    candidateDescription: "Travel and joining arrangements are in progress. Follow the checklist and instructions shared with you.",
    isTerminal: false,
    notifyCandidate: true,
    hi: { label: "जॉइनिंग की तैयारी", description: "यात्रा और जॉइनिंग की व्यवस्था चल रही है। आपके साथ साझा की गई चेकलिस्ट और निर्देशों का पालन करें।" },
    te: { label: "చేరడానికి సన్నాహాలు", description: "ప్రయాణం మరియు చేరిక ఏర్పాట్లు జరుగుతున్నాయి. మీతో పంచుకున్న చెక్‌లిస్ట్ మరియు సూచనలను అనుసరించండి." },
  },
  {
    key: STAGE_KEYS.joined,
    name: "Joined",
    category: "joined",
    candidateLabel: "Joined",
    candidateDescription: "You have joined the employer. Best wishes for your new role.",
    isTerminal: true,
    notifyCandidate: true,
    hi: { label: "जॉइन किया", description: "आपने नियोक्ता के साथ काम शुरू कर दिया है। आपकी नई भूमिका के लिए शुभकामनाएँ।" },
    te: { label: "చేరారు", description: "మీరు యజమాని వద్ద చేరారు. మీ కొత్త ఉద్యోగానికి శుభాకాంక్షలు." },
  },
  {
    key: STAGE_KEYS.closed,
    name: "Closed",
    category: "closed",
    candidateLabel: "Closed",
    candidateDescription: "This application is closed.",
    isTerminal: true,
    notifyCandidate: true,
    hi: { label: "बंद", description: "यह आवेदन बंद हो गया है।" },
    te: { label: "ముగిసింది", description: "ఈ దరఖాస్తు ముగిసింది." },
  },
  {
    key: STAGE_KEYS.rejected,
    name: "Rejected",
    category: "rejected",
    candidateLabel: "Not selected",
    candidateDescription: "The employer has decided not to move forward with your application. You can keep applying to other jobs.",
    isTerminal: true,
    notifyCandidate: true,
    hi: {
      label: "चयन नहीं हुआ",
      description: "नियोक्ता ने आपके आवेदन को आगे न बढ़ाने का निर्णय लिया है। आप अन्य नौकरियों के लिए आवेदन करते रह सकते हैं।",
    },
    te: {
      label: "ఎంపిక కాలేదు",
      description: "మీ దరఖాస్తును ముందుకు తీసుకెళ్లకూడదని యజమాని నిర్ణయించారు. మీరు ఇతర ఉద్యోగాలకు దరఖాస్తు చేస్తూనే ఉండవచ్చు.",
    },
  },
  {
    key: STAGE_KEYS.withdrawn,
    name: "Withdrawn",
    category: "withdrawn",
    candidateLabel: "Withdrawn",
    candidateDescription: "You withdrew this application.",
    isTerminal: true,
    notifyCandidate: false,
    hi: { label: "वापस लिया गया", description: "आपने यह आवेदन वापस ले लिया है।" },
    te: { label: "ఉపసంహరించబడింది", description: "మీరు ఈ దరఖాస్తును ఉపసంహరించుకున్నారు." },
  },
];

export const DEFAULT_WORKFLOW = {
  key: DEFAULT_WORKFLOW_KEY,
  name: "Standard recruitment",
  description:
    "Default hiring pipeline: screening, assessment, interviews, decision, offer, documentation, mobilisation and joining, with candidate-facing labels for every stage.",
  stages: STAGES.map((s, i) => stage(i, s)),
} as const;
