export const config = {
  ice_support: process.env.ICE_SUPPORT === 'true',
  dtls_cert_file: process.env.DTLS_CERT_FILE,
  dtls_private_key: process.env.DTLS_PRIVATE_KEY,
};
