import { Router, Request, Response } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import crypto from 'crypto';
import { config } from '../config';

export const endpointsRouter = Router();

endpointsRouter.post('', async (req: Request, res: Response) => {
  const { id, maxContacts } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  // All three rows or none: a half-created endpoint (e.g. ps_endpoints
  // without ps_aors) can't register and makes every retry fail with 409.
  let conn: PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    if (config.ice_support) {
      await conn.query(
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
      await conn.query('INSERT INTO ps_endpoints (id, aors, auth, context, disallow, allow, direct_media, webrtc, media_encryption_optimistic, force_rport, rtp_symmetric, rewrite_contact, dtls_cert_file, dtls_private_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, id, id, 'from-internal', 'all', 'ulaw,alaw', 'no', 'yes', 'yes', 'yes', 'yes', 'yes', config.dtls_cert_file, config.dtls_private_key])
    }
    await conn.query(
      'INSERT INTO ps_aors (id, max_contacts, remove_existing) VALUES (?, ?, ?)',
      [id, maxContacts || 3, 'no']
    );

    const password = crypto.randomBytes(16).toString('hex');
    await conn.query(
      'INSERT INTO ps_auths(id, auth_type, password, username) VALUES (?, ?, ?, ?)',
      [id, 'userpass', password, id]
    );
    await conn.commit();

    res.status(200).json({ password, username: id });
  } catch (error) {
    await conn?.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.includes('Duplicate entry')) {
      return res.status(409).json({
        "error": "duplicate_entry",
        "message": "Registration user already exists"
      });
    }
    console.error('Database error:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn?.release();
  }
});

endpointsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  // Express 4 doesn't catch async errors: an unhandled DB failure here left
  // the request hanging and crashed the process (unhandled rejection).
  try {
    await pool.query('DELETE FROM ps_endpoints WHERE id = ?', [id]);
    await pool.query('DELETE FROM ps_aors WHERE id = ?', [id]);
    await pool.query('DELETE FROM ps_auths WHERE id = ?', [id]);
    return res.status(200).json({ message: 'Endpoint deleted successfully' });
  } catch (error) {
    console.error('Database error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

endpointsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const maxContacts = Number(req.body?.maxContacts);
  if (!Number.isInteger(maxContacts) || maxContacts < 1) {
    return res.status(400).json({ error: 'maxContacts must be a positive integer' });
  }
  try {
    const [result] = await pool.query<ResultSetHeader>('UPDATE ps_aors SET max_contacts = ? WHERE id = ?', [maxContacts, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    return res.status(200).json({ username: id, maxContacts });
  } catch (error) {
    console.error('Database error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

endpointsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id as username, password FROM ps_auths WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Database error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
