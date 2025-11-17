import { registerWildcardHandler } from './ariEventHandlers';
import { registerStasisStartHandler } from './stasisStartHandler';
import { registerStasisEndHandler } from './stasisEndHandler';
import { registerChannelStateChangeHandler } from './channelStateChangeHandler';
import { registerBridgeCreatedHandler } from './bridgeCreatedHandler';
import { registerBridgeDestroyedHandler } from './bridgeDestroyedHandler';
import { registerChannelEnteredBridgeHandler } from './channelEnteredBridgeHandler';
import { registerChannelLeftBridgeHandler } from './channelLeftBridgeHandler';
import { registerChannelCreatedHandler } from './channelCreatedHandler';

export const registerAllEventHandlers = () => {
  registerWildcardHandler();
  registerStasisStartHandler();
  registerStasisEndHandler();
  registerChannelStateChangeHandler();
  registerBridgeCreatedHandler();
  registerBridgeDestroyedHandler();
  registerChannelEnteredBridgeHandler();
  registerChannelLeftBridgeHandler();
  registerChannelCreatedHandler();
};

