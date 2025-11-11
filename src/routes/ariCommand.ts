import { Router, Request, Response } from 'express';
import { ariClient } from '../utils/ariClient';

export const ariRouter = Router();

const handleError = (res: Response, error: unknown) => {
  console.error('[ARI] Error:', error);

  if (error instanceof Error) {
    return res.status(502).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(502).json({
    success: false,
    error: 'Unexpected ARI error',
  });
};

ariRouter.get('/bridges', async (req: Request, res: Response) => {
  try {
    const bridges = await ariClient.getBridges();
    return res.status(200).json({ success: true, bridges });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.post('/bridges', async (req: Request, res: Response) => {
  try {
    const { bridgeId, type, name, template } = req.body || {};
    const bridge = await ariClient.createBridge({
      bridgeId,
      type,
      name,
      template,
    });

    return res.status(201).json({
      success: true,
      bridge,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.get('/bridges/:bridgeId', async (req: Request, res: Response) => {
  try {
    const bridge = await ariClient.getBridge(req.params.bridgeId);
    return res.status(200).json({ success: true, bridge });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.delete('/bridges/:bridgeId', async (req: Request, res: Response) => {
  try {
    await ariClient.deleteBridge(req.params.bridgeId);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.post('/bridges/:bridgeId/add', async (req: Request, res: Response) => {
  try {
    const { channel, role } = req.body || {};
    if (!channel) {
      return res.status(400).json({ success: false, error: 'channel is required' });
    }

    const result = await ariClient.addChannelToBridge({
      bridgeId: req.params.bridgeId,
      channel,
      role,
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.post('/bridges/:bridgeId/remove', async (req: Request, res: Response) => {
  try {
    const { channel } = req.body || {};
    if (!channel) {
      return res.status(400).json({ success: false, error: 'channel is required' });
    }

    const result = await ariClient.removeChannelFromBridge({
      bridgeId: req.params.bridgeId,
      channel,
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.get('/channels', async (req: Request, res: Response) => {
  try {
    const channels = await ariClient.getChannels();
    return res.status(200).json({ success: true, channels });
  } catch (error) {
    return handleError(res, error);
  }
});

ariRouter.post('/channels/originate', async (req: Request, res: Response) => {
  try {
    const { endpoint, app, appArgs, channelId, callerId, timeout, variables } = req.body || {};

    if (!endpoint || !app) {
      return res.status(400).json({
        success: false,
        error: 'endpoint and app are required',
      });
    }

    const channel = await ariClient.originateChannel({
      endpoint,
      app,
      appArgs,
      channelId,
      callerId,
      timeout,
      variables,
    });

    return res.status(201).json({ success: true, channel });
  } catch (error) {
    return handleError(res, error);
  }
});


