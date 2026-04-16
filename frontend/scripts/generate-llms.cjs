const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://personaforge.pehloo.xyz';
const BLOG_DATA_PATH = path.resolve(__dirname, '../.generated/blog-posts.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/llms.txt');

function generateLlms() {
    console.log('Generating llms.txt...');

    let blogPosts = [];
    if (fs.existsSync(BLOG_DATA_PATH)) {
        try {
            blogPosts = JSON.parse(fs.readFileSync(BLOG_DATA_PATH, 'utf-8'));
        } catch (e) {
            console.warn('Warning: could not parse .generated/blog-posts.json, skipping blog entries');
        }
    } else {
        console.warn('Warning: .generated/blog-posts.json not found, blog section will be empty');
    }

    const blogSection = blogPosts.length > 0
        ? [
            '## Blog Posts',
            '',
            ...blogPosts.map(post =>
                `- [${post.title}](${BASE_URL}/blog/${post.slug}): ${post.description}`
            ),
            '',
          ].join('\n')
        : '';

    const llmsTxt = `# Persona Forge by Pehloo

> AI-powered user persona generator — describe your product, get structured, interview-ready personas in minutes.

Persona Forge uses Google Gemini AI to generate detailed user personas from product descriptions and file uploads. Designed for product managers, founders, and UX researchers who need fast, actionable personas grounded in real research frameworks.

## Pages

- [Home](${BASE_URL}/): Generate user personas — enter your product description and get structured personas instantly
- [Blog](${BASE_URL}/blog): Product intelligence — guides, insights, and research on user personas, AI product development, and UX research
- [Pricing](${BASE_URL}/pricing): Plans and pricing for Persona Forge

## Key Features

- Generate 3–5 structured user personas from a product description in under 60 seconds
- Upload PDFs, images, and markdown to enrich persona generation
- Export personas as PDF for stakeholder presentations
- Three generation modes: Quick, Think Hard, Do My Homework
- Persona fields: demographics, goals, frustrations, behavioral patterns, tech comfort, recruitment criteria

## About

Persona Forge is a product by Pehloo. It is designed to replace hours of manual persona research with AI-assisted generation that follows established UX research frameworks.

${blogSection}
## Optional

- [Privacy Policy](${BASE_URL}/privacy)
- [Terms of Service](${BASE_URL}/terms)
- [Sitemap](${BASE_URL}/sitemap.xml)
`;

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, llmsTxt);
    console.log(`Successfully generated llms.txt at ${OUTPUT_PATH}`);
    console.log(`  → ${blogPosts.length} blog posts included`);
}

generateLlms();
