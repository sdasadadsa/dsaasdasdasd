const https = require('https');

const REPO      = 'sdasadadsa/dsaasdasdasd';
const FILE_PATH = 'public/data.json';
const TOKEN     = process.env.GITHUB_TOKEN;

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

  if (!TOKEN) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'GITHUB_TOKEN not configured in Netlify environment variables' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { site, title, description, severity, addedBy } = body;
  if (!site || !title || !severity || !addedBy) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const vuln = {
    id: Date.now(),
    site,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    severity,
    date: new Date().toISOString().split('T')[0],
    addedBy: String(addedBy).trim()
  };

  try {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const fileData = await githubGet(`/repos/${REPO}/contents/${FILE_PATH}`);
      if (fileData.message) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: fileData.message }) };
      }

      const list = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
      // avoid duplicate if retry after partial success visibility
      if (!list.some(v => v && v.id === vuln.id)) {
        list.unshift(vuln);
      }

      const putRes = await githubPut(`/repos/${REPO}/contents/${FILE_PATH}`, {
        message: `add vuln: ${vuln.title.slice(0, 60)}`,
        content: Buffer.from(JSON.stringify(list, null, 2) + '\n').toString('base64'),
        sha: fileData.sha
      });

      if (putRes.content && putRes.content.sha) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ vuln, list }) };
      }

      // conflict / race — retry with fresh sha
      lastError = putRes.message || JSON.stringify(putRes);
      if (!(putRes.message || '').toLowerCase().includes('conflict') && putRes.message !== 'Not Found') {
        break;
      }
    }

    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: lastError || 'Failed to save' }) };
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}
