const https = require('https');

const REPO  = 'sdasadadsa/dsaasdasdasd';
const TOKEN = process.env.GITHUB_TOKEN;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!TOKEN) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' })
    };
  }

  try {
    const fileData = await githubGet(`/repos/${REPO}/contents/public/data.json`);
    if (fileData.message) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: fileData.message }) };
    }
    const list = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    return { statusCode: 200, headers: cors, body: JSON.stringify(list) };
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
        'User-Agent': 'vuln-tracker',
        Accept: 'application/vnd.github.v3+json',
        'Cache-Control': 'no-cache'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
