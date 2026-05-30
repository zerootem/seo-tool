const { analyzeSEO } = require('@lazymac/seo-analyzer-api');
const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/v1/analyze', async (req, res) => {
  const result = await analyzeSEO(req.body.url);
  res.json(result);
});

app.listen(3400, () => console.log('SEO API running on port 3400'));
