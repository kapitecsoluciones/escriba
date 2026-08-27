const PERMITIDAS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'NO_COLOR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
];

function limpio(extra = {}) {
  const env = {};
  for (const clave of PERMITIDAS) {
    if (process.env[clave] !== undefined) env[clave] = process.env[clave];
  }
  return { ...env, ...extra };
}

module.exports = { limpio };
