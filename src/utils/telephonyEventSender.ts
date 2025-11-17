interface TelephonyEventPayload {
  event: string;
  bridge_id?: string;
  uniqueid?: string;
  caller?: string;
  endpoint?: string;
  join_extension?: string;
  status?: 'pending' | 'dialing' | 'joined' | 'failed' | 'left';
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

interface ChannelEnteredBridgeEvent {
  bridge?: {
    id?: string;
    name?: string;
  };
  channel?: {
    id?: string;
    name?: string;
    caller?: {
      number?: string;
      name?: string;
    };
    dialplan?: {
      exten?: string;
      context?: string;
    };
  };
}

const TELEPHONY_EVENTS_URL = process.env.TELEPHONY_EVENTS_URL as string;

export const sendTelephonyEvent = async (payload: TelephonyEventPayload): Promise<void> => {
  try {
    const finalPayload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        join_extension: payload.join_extension || payload.metadata?.join_extension,
      },
    };

    const response = await fetch(TELEPHONY_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalPayload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telephony event API failed: ${response.status} ${response.statusText} - ${text}`);
    }

    console.log(`[Telephony Event] Sent ${payload.event} successfully`);
  } catch (error) {
    console.error(`[Telephony Event] Failed to send ${payload.event}:`, error);
    throw error;
  }
};

