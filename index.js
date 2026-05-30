const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');

const app = express();
app.use(express.json());

// منفذ Railway أو المنفذ الافتراضي 3400
const PORT = process.env.PORT || 3400;

// ==================== دوال التحليل الرئيسية ====================

// تحليل عنوان الصفحة
function analyzeTitle($, url) {
    let title = $('title').text().trim();
    let score = 0;
    let issues = [];
    let recommendations = [];

    if (!title) {
        issues.push('الصفحة لا تحتوي على عنوان (Title)');
        recommendations.push('أضف وصف عنوان بين 30-60 حرفاً');
    } else {
        let length = title.length;
        if (length >= 30 && length <= 60) {
            score = 100;
        } else if (length < 30) {
            score = 50;
            issues.push('العنوان قصير جداً (' + length + ' حرف)');
            recommendations.push('العنوان المثالي بين 30-60 حرفاً');
        } else if (length > 60) {
            score = 60;
            issues.push('العنوان طويل جداً (' + length + ' حرف)');
            recommendations.push('قصّر العنوان ليكون أقل من 60 حرفاً');
        }
    }
    return { score, issues, recommendations, content: title, length: title.length };
}

// تحليل وصف الميتا
function analyzeMetaDescription($) {
    let meta = $('meta[name="description"]').attr('content') || '';
    let length = meta.length;
    let score = 0;
    let issues = [];
    let recommendations = [];

    if (!meta) {
        issues.push('الصفحة تفتقد إلى وصف ميتا');
        recommendations.push('أضف وصفاً بين 120-160 حرفاً يحتوي على الكلمة المفتاحية');
    } else if (length >= 120 && length <= 160) {
        score = 100;
    } else if (length < 120) {
        score = 50;
        issues.push('الوصف قصير (' + length + ' حرف)');
        recommendations.push('زد طول الوصف إلى 120-160 حرفاً');
    } else {
        score = 60;
        issues.push('الوصف طويل (' + length + ' حرف)');
        recommendations.push('قصّر الوصف ليكون أقل من 160 حرفاً');
    }
    return { score, issues, recommendations, content: meta, length };
}

// تحليل العناوين (H1, H2, H3)
function analyzeHeadings($) {
    let h1Count = $('h1').length;
    let h1Text = $('h1').first().text().trim();
    let h2Count = $('h2').length;
    let issues = [];
    let recommendations = [];
    let score = 70;

    if (h1Count === 0) {
        issues.push('لا يوجد عنوان H1 في الصفحة');
        recommendations.push('أضف عنوان H1 واحد يحتوي على الكلمة المفتاحية الرئيسية');
        score = 30;
    } else if (h1Count > 1) {
        issues.push('يوجد ' + h1Count + ' عناوين H1');
        recommendations.push('استخدم عنوان H1 واحد فقط لكل صفحة');
        score = 50;
    } else if (!h1Text) {
        issues.push('عنوان H1 فارغ');
        recommendations.push('أضف محتوى نصياً لعنوان H1');
        score = 40;
    }

    if (h2Count === 0) {
        issues.push('لا توجد عناوين فرعية H2');
        recommendations.push('استخدم عناوين H2 لتنظيم المحتوى');
    }

    return { score, issues, recommendations, h1Count, h2Count, h1Text };
}

// تحليل الصور
function analyzeImages($) {
    let images = $('img');
    let total = images.length;
    let withAlt = 0;
    let issues = [];
    let recommendations = [];

    images.each((i, img) => {
        let alt = $(img).attr('alt');
        if (alt && alt.trim() !== '') {
            withAlt++;
        }
    });

    let score = total === 0 ? 100 : Math.round((withAlt / total) * 100);
    
    if (total > 0 && withAlt < total) {
        issues.push((total - withAlt) + ' صورة بدون نص Alt');
        recommendations.push('أضف نصاً وصفياً (Alt) لجميع الصور');
    }

    return { score, issues, recommendations, total, withAlt };
}

// تحليل الروابط
function analyzeLinks($, baseUrl) {
    let links = $('a');
    let total = links.length;
    let internal = 0;
    let external = 0;
    let issues = [];
    let recommendations = [];

    let baseDomain = new URL(baseUrl).hostname;

    links.each((i, link) => {
        let href = $(link).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            try {
                let linkUrl = new URL(href, baseUrl);
                if (linkUrl.hostname === baseDomain) {
                    internal++;
                } else {
                    external++;
                }
            } catch(e) {
                // تجاهل الروابط غير الصالحة
            }
        }
    });

    let score = total === 0 ? 50 : Math.min(100, Math.round((internal / total) * 100) + 20);
    
    if (internal < 3 && total > 0) {
        issues.push('عدد قليل من الروابط الداخلية');
        recommendations.push('أضف 3-5 روابط داخلية لمقالات ذات صلة');
    }

    return { score, issues, recommendations, total, internal, external };
}

// ==================== نقاط النهاية API ====================

// تحليل موقع واحد
app.post('/api/v1/analyze', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الصفحة' });
    }

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'SEO-Analyzer-Bot/1.0' },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        const dom = new JSDOM(response.data);
        
        // تحليل جميع العناصر
        const title = analyzeTitle($, url);
        const metaDesc = analyzeMetaDescription($);
        const headings = analyzeHeadings($);
        const images = analyzeImages($);
        const links = analyzeLinks($, url);
        
        // حساب الدرجة الإجمالية
        const weights = { title: 0.25, metaDesc: 0.2, headings: 0.2, images: 0.15, links: 0.2 };
        let overallScore = Math.round(
            (title.score * weights.title) +
            (metaDesc.score * weights.metaDesc) +
            (headings.score * weights.headings) +
            (images.score * weights.images) +
            (links.score * weights.links)
        );
        
        // تجميع جميع المشاكل والتوصيات
        let allIssues = [];
        let allRecommendations = [];
        
        [title, metaDesc, headings, images, links].forEach(cat => {
            allIssues.push(...(cat.issues || []));
            allRecommendations.push(...(cat.recommendations || []));
        });
        
        // تحديد الدرجة الحرفية
        let grade = 'F';
        if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 80) grade = 'B';
        else if (overallScore >= 70) grade = 'C';
        else if (overallScore >= 60) grade = 'D';
        
        res.json({
            url,
            overallScore,
            grade,
            scores: {
                title: title.score,
                metaDescription: metaDesc.score,
                headings: headings.score,
                images: images.score,
                links: links.score
            },
            summary: {
                totalIssues: allIssues.length,
                issues: allIssues.slice(0, 10),
                recommendations: allRecommendations.slice(0, 10)
            },
            details: { title, metaDesc, headings, images, links }
        });
        
    } catch (error) {
        console.error('خطأ:', error.message);
        res.status(500).json({ 
            error: 'فشل تحليل الصفحة',
            details: error.message,
            message: 'تأكد من أن الرابط صحيح والموقع متاح'
        });
    }
});

// مقارنة موقعين
app.post('/api/v1/compare', async (req, res) => {
    const { url1, url2 } = req.body;
    
    if (!url1 || !url2) {
        return res.status(400).json({ error: 'الرجاء إدخال الرابطين' });
    }
    
    try {
        const [result1, result2] = await Promise.all([
            axios.post(`http://localhost:${PORT}/api/v1/analyze`, { url: url1 }),
            axios.post(`http://localhost:${PORT}/api/v1/analyze`, { url: url2 })
        ]);
        
        res.json({
            url1: result1.data,
            url2: result2.data,
            comparison: {
                scoreDifference: result1.data.overallScore - result2.data.overallScore,
                winner: result1.data.overallScore >= result2.data.overallScore ? 'url1' : 'url2'
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'فشل في المقارنة' });
    }
});

// نقطة تحقق بسيطة
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'SEO API يعمل بشكل طبيعي' });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 SEO API يعمل على المنفذ ${PORT}`);
    console.log(`📊 استخدم: POST ${PORT}/api/v1/analyze`);
});
