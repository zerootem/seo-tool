const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// استخدام المنفذ الذي توفره Railway، أو 8080 كخيار احتياطي
const PORT = process.env.PORT || 8080;

// حل مشكلة CORS للسماح لأداتك بالتواصل مع الخادم
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// --- هذه هي نقطة النهاية (Endpoint) التي تبحث عنها أداة فحص الـ SEO ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'SEO API is running' });
});

app.post('/api/v1/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الصفحة' });
    }

    try {
        const response = await axios.get(url, { timeout: 15000 });
        const $ = cheerio.load(response.data);

        // --- تحليل سريع للمحتوى ---
        const title = $('title').text().trim();
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const h1Count = $('h1').length;
        
        // تحليل الصور
        const images = $('img');
        let imagesWithAlt = 0;
        images.each((i, img) => { if ($(img).attr('alt')) imagesWithAlt++; });

        // حساب درجة تقريبية
        let score = 70;
        let issues = [];
        
        if (!title) { score -= 30; issues.push('لا يوجد عنوان'); }
        if (!metaDesc) { score -= 20; issues.push('لا يوجد وصف ميتا'); }
        if (h1Count === 0) { score -= 15; issues.push('لا يوجد عنوان H1'); }
        if (images.length > 0 && imagesWithAlt < images.length) {
            score -= 10;
            issues.push((images.length - imagesWithAlt) + ' صورة بدون Alt');
        }
        
        score = Math.max(0, Math.min(100, score));
        let grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        
        // إرسال النتيجة بصيغة تتوافق مع أداة فحص SEO
        res.json({
            url,
            overallScore: score,
            grade,
            scores: {
                title: title ? 80 : 0,
                metaDescription: metaDesc ? 80 : 0,
                headings: h1Count === 1 ? 80 : 30,
                images: (images.length === 0 || imagesWithAlt === images.length) ? 80 : 40,
                links: 70
            },
            summary: {
                totalIssues: issues.length,
                issues: issues,
                recommendations: issues.map(i => 'قم بإصلاح: ' + i)
            },
            details: {
                wordCount: response.data.split(/\s+/).length,
                imageCount: images.length,
                imagesWithAlt: imagesWithAlt,
                h1Count: h1Count,
            }
        });
    } catch(e) {
        console.error('خطأ في التحليل:', e.message);
        res.status(500).json({ error: 'فشل تحليل الصفحة: ' + e.message });
    }
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`✅ خادم SEO API يعمل على المنفذ ${PORT}`);
});
