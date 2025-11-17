import { ariClient } from '../utils/ariClient';
import { ariWebSocket } from '../utils/ariWebSocket';
import type { AriEvent, AriChannel } from '../utils/ariWebSocket';
import { createOperatorChannel } from './stasisStartHandlers/createOperatorChannel';

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

    await ariClient.answerChannel(stasisEvent.channel?.id as string);

    switch (appArgs['callType']) {
      case 'createOperatorChannel':
        await createOperatorChannel(stasisEvent.channel as AriChannel, appArgs, stasisEvent.application as string, stasisEvent.timestamp || new Date().toISOString());
        break;
    }
  });
};

