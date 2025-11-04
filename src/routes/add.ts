import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import crypto from 'crypto';
import { config } from '../config';

export const addRouter = Router();

addRouter.post('/', async (req: Request, res: Response) => {
  const { id, maxContacts } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  try {
    await pool.query(
      'INSERT INTO ps_aors (id, max_contacts, remove_existing) VALUES (?, ?, ?)',
      [id, maxContacts || 1, 'no']
    );

    const password = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'INSERT INTO ps_auths(id, auth_type, password, username) VALUES (?, ?, ?, ?)',
      [id, 'userpass', password, id]
    );

    await pool.query(
      'INSERT INTO ps_endpoints (id, aors, auth, context, disallow, allow, direct_media, webrtc, media_encryption_optimistic, force_rport, rtp_symmetric, rewrite_contact, dtls_cert_file, dtls_private_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, id, id, 'ari_context', 'all', 'ulaw,alaw', 'no', 'yes', 'yes', 'yes', 'yes', 'yes', config.dtls_cert_file, config.dtls_private_key]
    );

    res.status(200).json({ password });
  } catch (error) {
    console.error('Database error:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

