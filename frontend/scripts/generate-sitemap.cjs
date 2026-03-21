const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://personaforge.pehloo.xyz';
const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';
const OUTPUT_PATH = path.resolve(__dirname, '../public/sitemap.xml');

async function generateSitemap() {
    console.log('Generating sitemap...');
    console.log(`Fetching blog posts from ${API_URL}/blog/...`);

    let slugs = [];

    try {
        // Try fetching from the API
        const response = await fetch(`${API_URL}/blog/?page=1&page_size=100`);
        if (response.ok) {
            const data = await response.json();
            slugs = data.posts.map(p => p.slug);
            console.log(`Fetched ${slugs.length} slugs from API.`);
        } else {
            console.warn(`API returned ${response.status}. Falling back to static extraction.`);
        }
    } catch (err) {
        console.warn(`Could not reach API (${err.message}). Falling back to static extraction.`);
    }

    // Fallback: extract slugs from the seed file if API is unavailable
    if (slugs.length === 0) {
        const seedPath = path.resolve(__dirname, '../../src/seed_blog.py');
        if (fs.existsSync(seedPath)) {
            const seedContent = fs.readFileSync(seedPath, 'utf8');
            const slugRegex = /"slug":\s*"([^"]+)"/g;
            let match;
            while ((match = slugRegex.exec(seedContent)) !== null) {
                slugs.push(match[1]);
            }
            console.log(`Extracted ${slugs.length} slugs from seed file.`);
        }
    }

    const date = new Date().toISOString().split('T')[0];

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <!-- Static Pages -->
    <url>
        <loc>${BASE_URL}/</loc>
        <lastmod>${date}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${BASE_URL}/pricing</loc>
        <lastmod>${date}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
    </url>
    <url>
        <loc>${BASE_URL}/blog</loc>
        <lastmod>${date}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${BASE_URL}/privacy</loc>
        <lastmod>${date}</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
    </url>
    <url>
        <loc>${BASE_URL}/terms</loc>
        <lastmod>${date}</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
    </url>
`;

    // Dynamic Blog Pages — use path-based URLs
    slugs.forEach(slug => {
        sitemap += `    <url>
        <loc>${BASE_URL}/blog/${slug}</loc>
        <lastmod>${date}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>\n`;
    });

    sitemap += '</urlset>';

    fs.writeFileSync(OUTPUT_PATH, sitemap);
    console.log(`Successfully generated sitemap.xml at ${OUTPUT_PATH}`);
    console.log(`Total URLs: ${5 + slugs.length}`);
}

generateSitemap();
