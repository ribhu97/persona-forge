/**
 * Blog data types.
 * 
 * Blog content is now stored in the database and served via the /blog API.
 * See src/lib/api.ts for the blogAPI client (BlogPostSummary, BlogPostFull).
 * 
 * This file is kept for backwards compatibility but the canonical types
 * are now defined alongside the API client.
 */

export type { BlogPostSummary, BlogPostFull } from '@/lib/api';
