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
    await pool.query('INSERT INTO ps_aors (id, max_contacts, remove_existing) values (:sip, :max_contacts, \'no\')',
      { sip: id, max_contacts: maxContacts || 1 });

    const password = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO ps_auths(id, auth_type, password, username) values (:sip, \'userpass\', :password, :sip)',
      { sip: id, password: password });

    await pool.query('INSERT INTO ps_endpoints (id, crm_user_id, aors, auth, context, disallow, allow, direct_media, webrtc, media_encryption_optimistic, force_rport, rtp_symmetric, rewrite_contact, dtls_cert_file, dtls_private_key) values (:sip, :crm_user_id, :sip, :sip, \'ari_context\', \'all\', \'ulaw,alaw\', \'no\', \'yes\', \'yes\', \'yes\', \'yes\', \'yes\', :dtls_cert_file, :dtls_private_key)',
      { sip: id, crm_user_id: id, dtls_cert_file: config.dtls_cert_file, dtls_private_key: config.dtls_private_key });

    res.status(200).json({ password });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

