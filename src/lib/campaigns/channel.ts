export const NO_PROVIDER_SKIP_REASON = "queued (no provider connected)";

export type OutboundCampaignMessage = {
  recipientId: string;
  phone: string;
  body: string;
};

export type CampaignSendResult = {
  recipientId: string;
  status: "QUEUED" | "FAILED";
  skipReason?: string;
};

export interface CampaignChannel {
  readonly name: string;
  sendBatch(messages: OutboundCampaignMessage[]): Promise<CampaignSendResult[]>;
}

export const noOpWhatsAppProvider: CampaignChannel = {
  name: "whatsapp-noop",
  async sendBatch(messages) {
    return messages.map((m) => ({
      recipientId: m.recipientId,
      status: "QUEUED" as const,
      skipReason: NO_PROVIDER_SKIP_REASON,
    }));
  },
};

let activeChannel: CampaignChannel = noOpWhatsAppProvider;

export function getCampaignChannel() {
  return activeChannel;
}

/** Test hook — swap provider when a real integration is wired. */
export function setCampaignChannelForTests(channel: CampaignChannel) {
  activeChannel = channel;
}

export function resetCampaignChannel() {
  activeChannel = noOpWhatsAppProvider;
}