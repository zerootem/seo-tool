const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3400;

// ==================== دوال التحليل ====================

async function analyzeUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // 1. تحليل العنوان
        const title = $('title').text().trim();
        let titleScore = 0;
        let titleIssues = [];
        if (!title) {
            titleIssues.push('الصفحة لا تحتوي على عنوان');
        } else if (title.length < 30) {
            titleIssues.push('العنوان قصير (' + title.length + ' حرف)');
            titleScore = 50;
        } else if (title.length > 60) {
            titleIssues.push('العنوان طويل (' + title.length + ' حرف)');
            titleScore = 60;
        } else {
            titleScore = 100;
        }
        
        // 2. تحليل الميتا
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        let metaScore = 0;
        let metaIssues = [];
        if (!metaDesc) {
            metaIssues.push('لا يوجد وصف ميتا');
        } else if (metaDesc.length < 120) {
            metaIssues.push('الوصف قصير (' + metaDesc.length + ' حرف)');
            metaScore = 50;
        } else if (metaDesc.length > 160) {
            metaIssues.push('الوصف طويل (' + metaDesc.length + ' حرف)');
            metaScore = 60;
        } else {
            metaScore = 100;
        }
        
        // 3. تحليل H1
        const h1Count = $('h1').length;
        let h1Score = 70;
        let h1Issues = [];
        if (h1Count === 0) {
            h1Issues.push('لا يوجد عنوان H1');
            h1Score = 30;
        } else if (h1Count > 1) {
            h1Issues.push('يوجد ' + h1Count + ' عناوين H1');
            h1Score = 50;
        }
        
        // 4. تحليل الصور
        const images = $('img');
        let imagesWithAlt = 0;
        images.each((i, img) => {
            const alt = $(img).attr('alt');
            if (alt && alt.trim() !== '') imagesWithAlt++;
        });
        const imageScore = images.length === 0 ? 100 : Math.round((imagesWithAlt / images.length) * 100);
        let imageIssues = [];
        if (images.length > 0 && imagesWithAlt < images.length) {
            imageIssues.push((images.length - imagesWithAlt) + ' صورة بدون نص Alt');
        }
        
        // 5. تحليل الروابط
        const links = $('a');
        let internalLinks = 0;
        let externalLinks = 0;
        try {
            const domain = new URL(url).hostname;
            links.each((i, link) => {
                const href = $(link).attr('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    try {
                        const linkUrl = new URL(href, url);
                        if (linkUrl.hostname === domain) internalLinks++;
                        else externalLinks++;
                    } catch(e) {}
                }
            });
        } catch(e) {}
        
        const linkScore = links.length === 0 ? 50 : Math.min(100, Math.round((internalLinks / links.length) * 100) + 20);
        let linkIssues = [];
        if (internalLinks < 3 && links.length > 0) {
            linkIssues.push('عدد الروابط الداخلية قليل');
        }
        
        // حساب الدرجة الإجمالية
        const overallScore = Math.round(
            (titleScore * 0.25) + (metaScore * 0.2) + (h1Score * 0.2) + 
            (imageScore * 0.15) + (linkScore * 0.2)
        );
        
        let grade = 'F';
        if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 80) grade = 'B';
        else if (overallScore >= 70) grade = 'C';
        else if (overallScore >= 60) grade = 'D';
        
        // تجميع كل المشاكل
        const allIssues = [...titleIssues, ...metaIssues, ...h1Issues, ...imageIssues, ...linkIssues];
        const recommendations = allIssues.map(issue => {
            if (issue.includes('عنوان')) return 'أضف عنواناً بين 30-60 حرفاً';
            if (issue.includes('ميتا')) return 'أضف وصفاً بين 120-160 حرفاً';
            if (issue.includes('H1')) return 'أضف عنوان H1 واحد يحتوي على الكلمة المفتاحية';
            if (issue.includes('صورة')) return 'أضف نص Alt لجميع الصور';
            if (issue.includes('روابط')) return 'أضف روابط داخلية لمقالات ذات صلة';
            return 'حسّن عناصر SEO الأساسية';
        });
        
        return {
            url,
            overallScore,
            grade,
            scores: {
                title: titleScore,
                metaDescription: metaScore,
                headings: h1Score,
                images: imageScore,
                links: linkScore
            },
            summary: {
                totalIssues: allIssues.length,
                issues: allIssues.slice(0, 10),
                recommendations: recommendations.slice(0, 10)
            },
            details: {
                wordCount: response.data.split(/\s+/).length,
                imageCount: images.length,
                imagesWithAlt: imagesWithAlt,
                h1Count: h1Count,
                internalLinks: internalLinks,
                externalLinks: externalLinks
            }
        };
        
    } catch (error) {
        throw new Error('فشل تحليل الصفحة: ' + error.message);
    }
}

// ==================== نقاط API ====================

app.post('/api/v1/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'الرجاء إدخال رابط' });
    
    try {
        const result = await analyzeUrl(url);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/compare', async (req, res) => {
    const { url1, url2 } = req.body;
    if (!url1 || !url2) return res.status(400).json({ error: 'الرجاء إدخال الرابطين' });
    
    try {
        const [result1, result2] = await Promise.all([
            analyzeUrl(url1),
            analyzeUrl(url2)
        ]);
        res.json({
            url1: result1,
            url2: result2,
            winner: result1.overallScore >= result2.overallScore ? 'url1' : 'url2'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`✅ SEO API يعمل على المنفذ ${PORT}`);
});

// معالجة الأخطاء العامة
process.on('uncaughtException', (err) => {
    console.error('خطأ غير متوقع:', err.message);
});
