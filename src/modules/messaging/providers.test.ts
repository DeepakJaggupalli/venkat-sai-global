import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Provider configuration is read through env() (cached on first use), so set it up front.
Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unit:unit@127.0.0.1:1/unit_tests_no_connection",
  MSG91_AUTH_KEY: "test-msg91-key",
  MSG91_TEMPLATE_ID: "tmpl-default",
  MSG91_SENDER_ID: "VSGLOB",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "test-token",
  TWILIO_FROM: "+15005550006",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_ACCESS_TOKEN: "test-wa-token",
});

const { buildMsg91Payload, buildTwilioForm, sendMsg91Sms, sendTwilioSms, MSG91_FLOW_URL } = await import("./sms");
const { buildWhatsAppTemplatePayload, sendMetaWhatsApp, DEFAULT_GRAPH_API_VERSION } = await import("./whatsapp");
const { maskRecipient, toMsisdn } = await import("./http");
const { describeSmtpError } = await import("./smtp");

const fetchMock = vi.fn<typeof fetch>();
beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("phone helpers", () => {
  it("normalises E.164 numbers for providers and masks them for logs", () => {
    expect(toMsisdn("+91 98765 43210")).toBe("919876543210");
    expect(toMsisdn("919876543210")).toBe("919876543210");
    expect(toMsisdn("12345")).toBeNull();
    expect(toMsisdn("not a phone")).toBeNull();
    expect(maskRecipient("+919876543210")).toBe("+91•••3210");
    expect(maskRecipient("ravi.kumar@example.com")).toBe("ra•••@example.com");
  });
});

describe("MSG91", () => {
  it("builds a Flow API payload with template variables", () => {
    const p = buildMsg91Payload({ to: "+919876543210", body: "unused", templateId: "tmpl-otp", variables: { otp: "123456" } }, { templateId: "tmpl-default", senderId: "VSGLOB" });
    expect(p).toEqual({ ok: true, body: { template_id: "tmpl-otp", short_url: "0", sender: "VSGLOB", recipients: [{ mobiles: "919876543210", otp: "123456" }] } });
  });

  it("falls back to the default template and sends the body as var1", () => {
    const p = buildMsg91Payload({ to: "+919876543210", body: "Hello" }, { templateId: "tmpl-default" });
    expect(p).toMatchObject({ ok: true, body: { template_id: "tmpl-default", recipients: [{ mobiles: "919876543210", var1: "Hello" }] } });
  });

  it("requires a DLT template id", () => {
    expect(buildMsg91Payload({ to: "+919876543210", body: "x" }, {})).toMatchObject({ ok: false });
  });

  it("sends with the authkey header and maps success / provider errors", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { type: "success", message: "req-42" }));
    const ok = await sendMsg91Sms({ to: "+919876543210", body: "x", variables: { otp: "999999" } });
    expect(ok).toEqual({ ok: true, provider: "msg91", providerMessageId: "req-42" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(MSG91_FLOW_URL);
    expect((init!.headers as Record<string, string>).authkey).toBe("test-msg91-key");

    fetchMock.mockResolvedValueOnce(json(200, { type: "error", message: "Template not approved" }));
    const err = await sendMsg91Sms({ to: "+919876543210", body: "x" });
    expect(err).toMatchObject({ ok: false, provider: "msg91" });
    expect(!err.ok && err.error).toContain("Template not approved");
  });

  it("maps timeouts and network errors without throwing", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const res = await sendMsg91Sms({ to: "+919876543210", body: "x" });
    expect(res).toMatchObject({ ok: false, provider: "msg91" });
    expect(!res.ok && res.error).toContain("did not respond");
  });
});

describe("Twilio", () => {
  it("builds the form with From or MessagingServiceSid", () => {
    expect(buildTwilioForm({ to: "+447700900123", body: "Hi" }, "+15005550006").toString()).toBe("To=%2B447700900123&From=%2B15005550006&Body=Hi");
    expect(buildTwilioForm({ to: "+447700900123", body: "Hi" }, "MG0123456789abcdef0123456789abcdef").get("MessagingServiceSid")).toBe("MG0123456789abcdef0123456789abcdef");
  });

  it("uses basic auth and maps API errors", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { sid: "SM123", status: "queued" }));
    expect(await sendTwilioSms({ to: "+447700900123", body: "Hi" })).toEqual({ ok: true, provider: "twilio", providerMessageId: "SM123" });
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("AC00000000000000000000000000000000:test-token").toString("base64")}`);

    fetchMock.mockResolvedValueOnce(json(400, { code: 21211, message: "Invalid 'To' Phone Number", status: 400 }));
    const err = await sendTwilioSms({ to: "+447700900123", body: "Hi" });
    expect(err).toMatchObject({ ok: false, provider: "twilio" });
    expect(!err.ok && err.error).toContain("21211");
  });
});

describe("Meta WhatsApp Cloud API", () => {
  it("builds a template message payload", () => {
    const p = buildWhatsAppTemplatePayload({ to: "+971501234567", templateName: "interview_reminder", languageCode: "en", variables: ["Ravi", "10 Nov 10:00"] });
    expect(p).toEqual({
      ok: true,
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "971501234567",
        type: "template",
        template: {
          name: "interview_reminder",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: "Ravi" }, { type: "text", text: "10 Nov 10:00" }] }],
        },
      },
    });
    expect(buildWhatsAppTemplatePayload({ to: "+971501234567", templateName: "Bad Name!", languageCode: "en", variables: [] })).toMatchObject({ ok: false });
  });

  it("posts to the Graph API with a bearer token and maps errors", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { messages: [{ id: "wamid.ABC" }] }));
    expect(await sendMetaWhatsApp({ to: "+971501234567", templateName: "welcome", languageCode: "en", variables: [] })).toEqual({
      ok: true,
      provider: "meta_whatsapp",
      providerMessageId: "wamid.ABC",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://graph.facebook.com/${DEFAULT_GRAPH_API_VERSION}/1234567890/messages`);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer test-wa-token");

    fetchMock.mockResolvedValueOnce(json(400, { error: { message: "Template name does not exist in the translation", code: 132001 } }));
    const err = await sendMetaWhatsApp({ to: "+971501234567", templateName: "missing", languageCode: "en", variables: [] });
    expect(err).toMatchObject({ ok: false, provider: "meta_whatsapp" });
    expect(!err.ok && err.error).toContain("132001");
  });
});

describe("SMTP error mapping", () => {
  it("summarises SMTP failures without message content", () => {
    const e = Object.assign(new Error("Invalid login: 535 Authentication failed"), { code: "EAUTH", responseCode: 535 });
    expect(describeSmtpError(e)).toBe("EAUTH SMTP 535: Invalid login: 535 Authentication failed");
    expect(describeSmtpError("weird")).toBe("SMTP send failed");
  });
});
