/**
 * Push is a wake/fallback mechanism only — never the source of truth.
 * See /docs/06-API-SPEC.md §WebSocket channels.
 */
export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationProvider {
  readonly vendorName: string;
  readonly isSandbox: boolean;
  sendPush(message: PushMessage): Promise<{ delivered: boolean }>;
}

/**
 * SMS (the person at home, phone checks): an interface only until the
 * vendor is decided (docs/21 §5 D4). There is no adapter, on purpose.
 */
export interface SmsProvider {
  readonly vendorName: string;
  readonly isSandbox: boolean;
  send(message: { toE164: string; text: string }): Promise<{ delivered: boolean }>;
}
