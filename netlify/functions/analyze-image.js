const https = require('https');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OPENAI_API_KEY environment variable is not set.' })
    };
  }

  try {
    const { image_base64, model = 'gpt-4o-mini', detail = 'low', max_tokens = 300 } = JSON.parse(event.body);

    if (!image_base64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'image_base64 is required' }) };
    }

    const payload = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this weighing scale image. Identify: 1)crop/produce name 2)weight on scale in kg 3)confidence(high/medium/low). Return ONLY JSON:{"crop":"name","weight":"number","weight_unit":"kg","confidence":"high/medium/low","notes":"brief"}. Unknown="unknown".'
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/jpeg;base64,' + image_base64,
                detail: detail
              }
            }
          ]
        }
      ],
      max_tokens: max_tokens,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const data = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    if (data.statusCode !== 200) {
      return { statusCode: data.statusCode, body: data.body };
    }

    const openaiRes = JSON.parse(data.body);
    const content = JSON.parse(openaiRes.choices[0].message.content);
    
    // Add fake usage info so frontend doesn't crash if it expects it
    const u = openaiRes.usage || {};
    content._cost = ((u.prompt_tokens || 0) * 0.00000015 + (u.completion_tokens || 0) * 0.0000006).toFixed(6);
    content._tokens = u.total_tokens || 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
