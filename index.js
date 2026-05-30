const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3400;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'SEO API is running' });
});

app.post('/api/v1/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    try {
        const response = await axios.get(url, { timeout: 15000 });
        const $ = cheerio.load(response.data);
        
        const title = $('title').text().trim();
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        
        let score = 70;
        if (!title) score -= 30;
        else if (title.length < 30 || title.length > 60) score -= 15;
        if (!metaDesc) score -= 20;
        else if (metaDesc.length < 120 || metaDesc.length > 160) score -= 10;
        
        res.json({ url, overallScore: score, grade: score >= 70 ? 'Good' : 'Needs Improvement' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
