const https = require('https');

const REPO      = 'sdasadadsa/dsaasdasdasd';
const FILE_PATH = 'public/fixed.json';
const TOKEN     = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN environment variable is not set!');
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { id, nick, action } = body;
  if (!id || !nick || !action) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  if (!TOKEN) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured in Netlify environment variables' }) };
  }

  try {
    const fileData   = await githubGet(`/repos/${REPO}/contents/${FILE_PATH}`);
    const fixedMap   = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    const sha        = fileData.sha;
    const key        = String(id);

    if (action === 'fix') {
      fixedMap[key] = { nick, date: new Date().toISOString().split('T')[0] };
    } else {
      delete fixedMap[key];
    }

    const newContent = Buffer.from(JSON.stringify(fixedMap, null, 2)).toString('base64');
    await githubPut(`/repos/${REPO}/contents/${FILE_PATH}`, {
      message: `toggle ${key}: ${action}`,
      content: newContent,
      sha
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify(fixedMap) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path, method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent':  'vuln-tracker',
        Accept:        'application/vnd.github.v3+json'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

function githubPut(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.github.com',
      path, method: 'PUT',
      headers: {
        Authorization:   `Bearer ${TOKEN}`,
        'User-Agent':    'vuln-tracker',
        Accept:          'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}
