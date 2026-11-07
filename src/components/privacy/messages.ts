/**
 * Copy for the consent banner and preferences form in the site languages (English, Hindi, Telugu).
 * Kept here (not in src/i18n/messages) because the banner renders on every page, outside any
 * I18nProvider. Hindi and Telugu should be reviewed by a native speaker before launch.
 */
import type { Locale } from "@/i18n/config";

export type ConsentMessages = {
  regionLabel: string;
  bannerTitle: string;
  bannerBody: string;
  acceptAll: string;
  rejectAll: string;
  customise: string;
  cookiePolicy: string;
  cookiePreferences: string;
  gpcNotice: string;
  ok: string;
  dialogTitle: string;
  dialogDescription: string;
  essentialTitle: string;
  essentialDescription: string;
  alwaysOn: string;
  functionalTitle: string;
  functionalDescription: string;
  analyticsTitle: string;
  analyticsDescription: string;
  analyticsGa4: string;
  sessionInsightsTitle: string;
  sessionInsightsDescription: string;
  sessionInsightsClarity: string;
  sessionInsightsNotInUse: string;
  gpcNote: string;
  save: string;
  saved: string;
  saveError: string;
  lastSaved: string;
};

const en: ConsentMessages = {
  regionLabel: "Cookie consent",
  bannerTitle: "Your privacy choices",
  bannerBody:
    "We use essential cookies to keep Venkat Sai Global secure and working. With your permission, we would also like to use optional cookies to remember your settings and to understand how the site is used, so we can improve it. Analytics are pseudonymous and never include what you type into forms.",
  acceptAll: "Accept all",
  rejectAll: "Reject non-essential",
  customise: "Customise",
  cookiePolicy: "Cookie policy",
  cookiePreferences: "Cookie preferences",
  gpcNotice:
    "We detected a Global Privacy Control signal from your browser, so analytics and session insights are switched off. You can review this in your cookie preferences.",
  ok: "OK",
  dialogTitle: "Cookie preferences",
  dialogDescription: "Choose which optional cookies we may use. You can change your choice at any time on the cookie preferences page.",
  essentialTitle: "Essential",
  essentialDescription: "Needed for security, signing in, remembering your cookie choice and keeping forms working. These are always on.",
  alwaysOn: "Always on",
  functionalTitle: "Functional",
  functionalDescription: "Remember optional settings you choose, such as display preferences, between visits.",
  analyticsTitle: "Analytics",
  analyticsDescription:
    "Pseudonymous statistics about pages visited, buttons clicked and how far pages are scrolled, used to improve the site. We never record what you type, your keystrokes or your clipboard.",
  analyticsGa4: "Includes Google Analytics 4, which receives pseudonymous usage data with advertising features turned off.",
  sessionInsightsTitle: "Session insights",
  sessionInsightsDescription:
    "Masked recordings of how pages are used (clicks, scrolling and mouse movement) to find confusing pages or errors. Text you type is masked.",
  sessionInsightsClarity: "Provided by Microsoft Clarity.",
  sessionInsightsNotInUse: "Not in use at the moment. We would only start with your permission.",
  gpcNote: "Your browser is sending a Global Privacy Control signal. Analytics and session insights stay off unless you switch them on here.",
  save: "Save choices",
  saved: "Your cookie choices have been saved.",
  saveError: "Your choices could not be saved in this browser. Check that cookies are allowed and try again.",
  lastSaved: "Last saved {date}",
};

const hi: ConsentMessages = {
  regionLabel: "कुकी सहमति",
  bannerTitle: "आपकी गोपनीयता से जुड़े विकल्प",
  bannerBody:
    "हम Venkat Sai Global को सुरक्षित और चालू रखने के लिए ज़रूरी कुकीज़ का उपयोग करते हैं। आपकी अनुमति से, हम आपकी सेटिंग्स याद रखने और यह समझने के लिए कि साइट का उपयोग कैसे होता है, वैकल्पिक कुकीज़ का भी उपयोग करना चाहेंगे, ताकि हम इसे बेहतर बना सकें। एनालिटिक्स छद्मनाम (pseudonymous) होते हैं और इनमें फ़ॉर्म में आपके द्वारा लिखी गई कोई भी जानकारी शामिल नहीं होती।",
  acceptAll: "सभी स्वीकार करें",
  rejectAll: "गैर-ज़रूरी अस्वीकार करें",
  customise: "अपनी पसंद चुनें",
  cookiePolicy: "कुकी नीति",
  cookiePreferences: "कुकी प्राथमिकताएँ",
  gpcNotice:
    "आपके ब्राउज़र से ग्लोबल प्राइवेसी कंट्रोल (GPC) सिग्नल मिला है, इसलिए एनालिटिक्स और सेशन इनसाइट्स बंद कर दिए गए हैं। आप इसे अपनी कुकी प्राथमिकताओं में देख सकते हैं।",
  ok: "ठीक है",
  dialogTitle: "कुकी प्राथमिकताएँ",
  dialogDescription: "चुनें कि हम कौन-सी वैकल्पिक कुकीज़ का उपयोग कर सकते हैं। आप कुकी प्राथमिकताएँ पेज पर कभी भी अपनी पसंद बदल सकते हैं।",
  essentialTitle: "ज़रूरी",
  essentialDescription: "सुरक्षा, साइन इन करने, आपकी कुकी पसंद याद रखने और फ़ॉर्म को चालू रखने के लिए आवश्यक। ये हमेशा चालू रहती हैं।",
  alwaysOn: "हमेशा चालू",
  functionalTitle: "कार्यात्मक",
  functionalDescription: "आपकी चुनी हुई वैकल्पिक सेटिंग्स, जैसे डिस्प्ले से जुड़ी पसंद, अगली विज़िट के लिए याद रखें।",
  analyticsTitle: "एनालिटिक्स",
  analyticsDescription:
    "देखे गए पेज, क्लिक किए गए बटन और पेज कितना स्क्रॉल किया गया, इसके छद्मनाम आँकड़े, जिनका उपयोग साइट को बेहतर बनाने के लिए होता है। हम आपके द्वारा लिखी गई जानकारी, कीस्ट्रोक या क्लिपबोर्ड कभी रिकॉर्ड नहीं करते।",
  analyticsGa4: "इसमें Google Analytics 4 शामिल है, जिसे विज्ञापन सुविधाएँ बंद रखते हुए छद्मनाम उपयोग डेटा मिलता है।",
  sessionInsightsTitle: "सेशन इनसाइट्स",
  sessionInsightsDescription:
    "पेजों के उपयोग (क्लिक, स्क्रॉल और माउस की गतिविधि) की मास्क की गई रिकॉर्डिंग, ताकि उलझाने वाले पेज या त्रुटियाँ पहचानी जा सकें। आपके द्वारा लिखा गया टेक्स्ट मास्क रहता है।",
  sessionInsightsClarity: "Microsoft Clarity द्वारा प्रदान किया गया।",
  sessionInsightsNotInUse: "फ़िलहाल उपयोग में नहीं है। हम इसे केवल आपकी अनुमति से ही शुरू करेंगे।",
  gpcNote: "आपका ब्राउज़र ग्लोबल प्राइवेसी कंट्रोल सिग्नल भेज रहा है। जब तक आप यहाँ इन्हें चालू नहीं करते, एनालिटिक्स और सेशन इनसाइट्स बंद रहेंगे।",
  save: "पसंद सहेजें",
  saved: "आपकी कुकी पसंद सहेज ली गई है।",
  saveError: "इस ब्राउज़र में आपकी पसंद सहेजी नहीं जा सकी। जाँचें कि कुकीज़ की अनुमति है और फिर से कोशिश करें।",
  lastSaved: "अंतिम बार सहेजा गया: {date}",
};

const te: ConsentMessages = {
  regionLabel: "కుకీ సమ్మతి",
  bannerTitle: "మీ గోప్యతా ఎంపికలు",
  bannerBody:
    "Venkat Sai Global ను సురక్షితంగా, సక్రమంగా పనిచేసేలా ఉంచడానికి మేము అవసరమైన కుకీలను ఉపయోగిస్తాము. మీ అనుమతితో, మీ సెట్టింగ్‌లను గుర్తుంచుకోవడానికి మరియు సైట్‌ను మెరుగుపరచేందుకు అది ఎలా ఉపయోగించబడుతుందో అర్థం చేసుకోవడానికి ఐచ్ఛిక కుకీలను కూడా ఉపయోగించాలనుకుంటున్నాము. అనలిటిక్స్ మారుపేరుతో (pseudonymous) ఉంటాయి, ఫారమ్‌లలో మీరు టైప్ చేసే ఏ సమాచారాన్నీ కలిగి ఉండవు.",
  acceptAll: "అన్నీ అంగీకరించండి",
  rejectAll: "అవసరం లేనివి తిరస్కరించండి",
  customise: "అనుకూలీకరించండి",
  cookiePolicy: "కుకీ విధానం",
  cookiePreferences: "కుకీ ప్రాధాన్యతలు",
  gpcNotice:
    "మీ బ్రౌజర్ నుండి గ్లోబల్ ప్రైవసీ కంట్రోల్ (GPC) సంకేతం వచ్చింది, కాబట్టి అనలిటిక్స్ మరియు సెషన్ ఇన్‌సైట్స్ ఆఫ్ చేయబడ్డాయి. మీరు దీన్ని మీ కుకీ ప్రాధాన్యతలలో చూడవచ్చు.",
  ok: "సరే",
  dialogTitle: "కుకీ ప్రాధాన్యతలు",
  dialogDescription: "మేము ఏ ఐచ్ఛిక కుకీలను ఉపయోగించవచ్చో ఎంచుకోండి. కుకీ ప్రాధాన్యతల పేజీలో మీ ఎంపికను ఎప్పుడైనా మార్చుకోవచ్చు.",
  essentialTitle: "అవసరమైనవి",
  essentialDescription: "భద్రత, సైన్ ఇన్, మీ కుకీ ఎంపికను గుర్తుంచుకోవడం మరియు ఫారమ్‌లు పనిచేయడానికి అవసరం. ఇవి ఎల్లప్పుడూ ఆన్‌లో ఉంటాయి.",
  alwaysOn: "ఎల్లప్పుడూ ఆన్",
  functionalTitle: "ఫంక్షనల్",
  functionalDescription: "మీరు ఎంచుకున్న ఐచ్ఛిక సెట్టింగ్‌లను, ఉదాహరణకు డిస్‌ప్లే ప్రాధాన్యతలను, తదుపరి సందర్శనలకు గుర్తుంచుకుంటుంది.",
  analyticsTitle: "అనలిటిక్స్",
  analyticsDescription:
    "సందర్శించిన పేజీలు, క్లిక్ చేసిన బటన్లు, పేజీలు ఎంత వరకు స్క్రోల్ చేయబడ్డాయి అనే మారుపేరు గణాంకాలు; సైట్‌ను మెరుగుపరచడానికి ఉపయోగిస్తాము. మీరు టైప్ చేసేది, కీస్ట్రోక్‌లు లేదా క్లిప్‌బోర్డ్‌ను మేము ఎప్పుడూ రికార్డ్ చేయము.",
  analyticsGa4: "ఇందులో Google Analytics 4 ఉంటుంది; ప్రకటన ఫీచర్లు ఆఫ్‌లో ఉంచి దానికి మారుపేరు వినియోగ డేటా అందుతుంది.",
  sessionInsightsTitle: "సెషన్ ఇన్‌సైట్స్",
  sessionInsightsDescription:
    "గందరగోళంగా ఉన్న పేజీలు లేదా లోపాలను కనుగొనడానికి, పేజీలు ఎలా ఉపయోగించబడుతున్నాయో (క్లిక్‌లు, స్క్రోలింగ్, మౌస్ కదలికలు) చూపే మాస్క్ చేసిన రికార్డింగ్‌లు. మీరు టైప్ చేసే టెక్స్ట్ మాస్క్ చేయబడుతుంది.",
  sessionInsightsClarity: "Microsoft Clarity ద్వారా అందించబడుతుంది.",
  sessionInsightsNotInUse: "ప్రస్తుతం ఉపయోగంలో లేదు. మీ అనుమతితో మాత్రమే మేము దీన్ని ప్రారంభిస్తాము.",
  gpcNote: "మీ బ్రౌజర్ గ్లోబల్ ప్రైవసీ కంట్రోల్ సంకేతాన్ని పంపుతోంది. మీరు ఇక్కడ ఆన్ చేసే వరకు అనలిటిక్స్ మరియు సెషన్ ఇన్‌సైట్స్ ఆఫ్‌లోనే ఉంటాయి.",
  save: "ఎంపికలను సేవ్ చేయండి",
  saved: "మీ కుకీ ఎంపికలు సేవ్ చేయబడ్డాయి.",
  saveError: "ఈ బ్రౌజర్‌లో మీ ఎంపికలను సేవ్ చేయలేకపోయాము. కుకీలు అనుమతించబడ్డాయో లేదో చూసి, మళ్లీ ప్రయత్నించండి.",
  lastSaved: "చివరిగా సేవ్ చేసింది: {date}",
};

const CATALOGUE: Record<Locale, ConsentMessages> = { en, hi, te };

export function consentMessages(locale: string | null | undefined): ConsentMessages {
  return (locale && CATALOGUE[locale as Locale]) || en;
}
