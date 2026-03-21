const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://personaforge.pehloo.xyz';
const OUTPUT_PATH = path.resolve(__dirname, '../public/robots.txt');

function generateRobots() {
    console.log('Generating robots.txt...');

    const robots = `# Persona Forge — AI User Persona Generator by Pehloo
# https://personaforge.pehloo.xyz

User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;

    fs.writeFileSync(OUTPUT_PATH, robots);
    console.log(`Successfully generated robots.txt at ${OUTPUT_PATH}`);
}

generateRobots();
