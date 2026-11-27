import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { findDocumentByVerificationCode, renderDocument } from "@/modules/documents/service";

/**
 * GET /verify-certificate/XXXX-XXXX-XXXX/pdf — the PDF of an approved certificate or letter for a trainee or intern.
 * The verification code is a random 12-character token, so the link is what the person shares (or staff send on
 * WhatsApp / email). Same per-network rate limit as the check page. `?download=1` saves instead of opening.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const meta = await getRequestMeta();
  const limited = await rateLimit(`certificate-verify:${meta.ipHash ?? "unknown"}`, 30, 10 * 60);
  if (!limited.allowed) return new Response("Too many requests. Please wait a few minutes.", { status: 429, headers: { "Retry-After": "600" } });
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    // Malformed escapes simply do not match.
  }
  const doc = await findDocumentByVerificationCode(decoded.slice(0, 32));
  if (!doc || doc.status !== "approved") return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const { bytes, filename } = await renderDocument(doc);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
