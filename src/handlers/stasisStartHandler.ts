import { ariClient } from '../utils/ariClient';
import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent, AriChannel } from '../utils/ariWebSocket';
import { createOperatorChannel } from './stasisStartHandlers/createOperatorChannel';
import { handleIncomingExternalCall } from './stasisStartHandlers/handleIncomingExternalCall';
import { handleBridgeIncomingCall } from './stasisStartHandlers/handleBridgeIncomingCall';

interface StasisStartEvent extends AriEvent {
  channel?: AriChannel;
  args?: string[];
  asterisk_id?: string;
}

const parseArgs = (args: string[]): Record<string, string> => {
  const argsObj: Record<string, string> = {};
  if (Array.isArray(args)) {
    for (const arg of args) {
      const [name, val] = arg.split(':::');
      if (name.length === 0) continue;
      argsObj[name] = val;
    }
  }
  return argsObj;
};

export const registerStasisStartHandler = () => {
  ariWebSocket.on('StasisStart', async (event: StasisStartEvent) => {
    const stasisEvent = event as StasisStartEvent;
    console.log('[ARI] Channel entered Stasis:', event.channel?.id);
    
    const appArgs = parseArgs(stasisEvent.args || []);

    if (!appArgs['callType']) {
      ariClient.deleteChannel(stasisEvent.channel?.id as string);
      return;
    }

    const channelId = stasisEvent.channel?.id as string;

    try {
      await ariClient.answerChannel(channelId);

      switch (appArgs['callType']) {
        case 'createOperatorChannel':
          await createOperatorChannel(stasisEvent.channel as AriChannel, appArgs, stasisEvent.application as string, stasisEvent.timestamp || new Date().toISOString());
          break;
        case 'incomingExternalCall':
          await handleIncomingExternalCall(stasisEvent.channel as AriChannel, appArgs);
          break;
        case 'bridgeIncomingCall':
          await handleBridgeIncomingCall(stasisEvent.channel as AriChannel, appArgs);
          break;
      }
    } catch (error) {
      // Otherwise this is an unhandled rejection inside an async event
      // handler — silently swallowed, caller left hanging with no clue why.
      console.error('[ARI] StasisStart handling failed, hanging up channel:', channelId, appArgs['callType'], error);
      await ariClient.deleteChannel(channelId).catch(() => undefined);
    }
  });
};

