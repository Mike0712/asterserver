import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import crypto from 'crypto';
import { config } from '../config';

export const endpointsRouter = Router();

endpointsRouter.post('/add', async (req: Request, res: Response) => {
  const { id, maxContacts } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  try {
    if (config.ice_support) {
      await pool.query(
        `INSERT INTO ps_endpoints (
            id,
            transport,
            aors,
            auth,
            context,
            disallow,
            allow,
            direct_media,
            webrtc,
            media_encryption,
            media_encryption_optimistic,
            dtls_cert_file,
            dtls_private_key,
            dtls_verify,
            dtls_setup,
            use_avpf,
            rtcp_mux,
            ice_support,
            rtp_symmetric,
            force_rport,
            rewrite_contact,
            media_use_received_transport
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,                      // id
          'transport-wss',         // transport
          id,                      // aors
          id,                      // auth
          'from-internal',         // context
          'all',                   // disallow
          'ulaw,alaw',             // allow
          'no',                    // direct_media
          'yes',                   // webrtc
          'dtls',                  // media_encryption
          'yes',                   // media_encryption_optimistic
          config.dtls_cert_file,   // dtls_cert_file
          config.dtls_private_key, // dtls_private_key
          'fingerprint',           // dtls_verify
          'actpass',               // dtls_setup
          'yes',                   // use_avpf
          'yes',                   // rtcp_mux
          'yes',                   // ice_support
          'yes',                   // rtp_symmetric
          'yes',                   // force_rport
          'yes',                   // rewrite_contact
          'no'                     // media_use_received_transport
        ]
      );
    } else {
      await pool.query('INSERT INTO ps_endpoints (id, aors, auth, context, disallow, allow, direct_media, webrtc, media_encryption_optimistic, force_rport, rtp_symmetric, rewrite_contact, dtls_cert_file, dtls_private_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, id, id, 'from-internal', 'all', 'ulaw,alaw', 'no', 'yes', 'yes', 'yes', 'yes', 'yes', config.dtls_cert_file, config.dtls_private_key])
    }
    await pool.query(
      'INSERT INTO ps_aors (id, max_contacts, remove_existing) VALUES (?, ?, ?)',
      [id, maxContacts || 1, 'no']
    );

    const password = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'INSERT INTO ps_auths(id, auth_type, password, username) VALUES (?, ?, ?, ?)',
      [id, 'userpass', password, id]
    );



    res.status(200).json({ password, username: id });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Duplicate entry')) {
      return res.status(409).json({
        "error": "duplicate_entry",
        "message": "Registration user already exists"
      });
    }
    console.error('Database error:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

endpointsRouter.post('/delete', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
});

endpointsRouter.post('/update', async (req: Request, res: Response) => {
  const { id, maxContacts } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
});

endpointsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  const endpoint = await pool.query('SELECT id, password FROM ps_auths WHERE id = ?', [id]);
  return res.status(200).json(endpoint[0]);
});
