/** Minimal types for the parts of `web-push` (CommonJS, no bundled types) used by src/modules/push. */
declare module "web-push" {
  export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  export type RequestOptions = {
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
    timeout?: number;
    headers?: Record<string, string>;
  };
  export type SendResult = { statusCode: number; body: string; headers: Record<string, string> };
  export class WebPushError extends Error {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    endpoint: string;
  }
  export function sendNotification(subscription: PushSubscription, payload?: string | null, options?: RequestOptions): Promise<SendResult>;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  const webpush: { sendNotification: typeof sendNotification; generateVAPIDKeys: typeof generateVAPIDKeys; WebPushError: typeof WebPushError };
  export default webpush;
}
