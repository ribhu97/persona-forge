const fs = require('fs');
const path = require('path');

// Load .env if VITE_API_URL isn't already in the environment
// (Vite loads .env automatically during builds, but plain `node` does not)
if (!process.env.VITE_API_URL) {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
            const match = line.match(/^VITE_API_URL\s*=\s*(.+)$/);
            if (match) {
                process.env.VITE_API_URL = match[1].trim().replace(/^["']|["']$/g, '');
                break;
            }
        }
    }
}

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';
const OUTPUT_PATH = path.resolve(__dirname, '../.generated/blog-posts.json');
const BASELINE_PATH = OUTPUT_PATH; // same file; baseline = committed version

async function fetchBlogData() {
    console.log('Fetching full blog content from API...');
    console.log(`  API: ${API_URL}/api/blog/all`);

    let posts = null;

    try {
        const response = await fetch(`${API_URL}/api/blog/all`);
        if (response.ok) {
            posts = await response.json();
            console.log(`  Fetched ${posts.length} posts with full content.`);
        } else {
            console.warn(`  API returned ${response.status}: ${response.statusText}`);
        }
    } catch (err) {
        console.warn(`  Could not reach API: ${err.message}`);
    }

    if (!posts) {
        // Check if a baseline file exists (committed or from a previous successful run)
        if (fs.existsSync(BASELINE_PATH)) {
            console.warn('  WARNING: Using existing baseline .generated/blog-posts.json — content may be stale.');
            console.warn('  Run with a live API to refresh.');
            return; // Baseline already exists; don't overwrite with nothing
        }

        // No API, no baseline — fail the build
        console.error('  FATAL: API unreachable and no baseline .generated/blog-posts.json found.');
        console.error('  Start the backend before running the build, or commit a baseline blog-posts.json.');
        process.exit(1);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(posts, null, 2));
    console.log(`  Written to ${OUTPUT_PATH}`);
}

fetchBlogData();
