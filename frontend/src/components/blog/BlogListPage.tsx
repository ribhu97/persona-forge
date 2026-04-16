import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { BlogPostSummary } from '@/lib/api';
import { blogAPI } from '@/lib/api';
import { useNavigate, useLoaderData } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

interface BlogListPageProps {
    className?: string;
}

export function BlogListPage({ className }: BlogListPageProps) {
    const navigate = useNavigate();
    const loaderPosts = useLoaderData() as BlogPostSummary[] | undefined;

    const [posts, setPosts] = useState<BlogPostSummary[]>(loaderPosts ?? []);
    const [loading, setLoading] = useState(!loaderPosts || loaderPosts.length === 0);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [, setRetryCount] = useState(0);

    // Only fetch client-side if loader didn't populate (shouldn't happen in SSG, but guards hydration)
    useState(() => {
        if (loaderPosts && loaderPosts.length > 0) return;
        setLoading(true);
        setError(null);
        blogAPI.list(page, 10)
            .then((res) => {
                setPosts(res.posts);
                setTotalPages(res.total_pages);
            })
            .catch((err) => {
                console.error('Failed to fetch blog posts:', err);
                setError('Failed to load blog posts. Please try again.');
            })
            .finally(() => setLoading(false));
    });

    const loadPage = (newPage: number) => {
        setPage(newPage);
        setLoading(true);
        setError(null);
        blogAPI.list(newPage, 10)
            .then((res) => {
                setPosts(res.posts);
                setTotalPages(res.total_pages);
            })
            .catch((err) => {
                console.error('Failed to fetch blog posts:', err);
                setError('Failed to load blog posts. Please try again.');
            })
            .finally(() => setLoading(false));
    };

    return (
        <div className={cn(
            "min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8 relative",
            className
        )}>
            <Helmet>
                <title>Blog — Product Intelligence | Persona Forge by Pehloo</title>
                <meta name="description" content="Guides, insights, and research on shipping better products through rapid validation and data-driven user personas." />
                <link rel="canonical" href={`${import.meta.env.VITE_SITE_URL ?? 'https://personaforge.pehloo.xyz'}/blog`} />
                <meta property="og:title" content="Blog — Persona Forge by Pehloo" />
                <meta property="og:description" content="Guides, insights, and research on shipping better products through rapid validation and data-driven user personas." />
                <meta property="og:url" content={`${import.meta.env.VITE_SITE_URL ?? 'https://personaforge.pehloo.xyz'}/blog`} />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary" />
                <meta name="twitter:title" content="Blog — Persona Forge by Pehloo" />
                <meta name="twitter:description" content="Guides, insights, and research on shipping better products through rapid validation and data-driven user personas." />
            </Helmet>

            {/* JSON-LD Structured Data for Blog Page */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Blog",
                        "name": "Pehloo Persona Forge Blog",
                        "description": "Insights, guides, and research on user personas, AI product development, and UX research.",
                        "url": "https://personaforge.pehloo.xyz/blog",
                        "blogPost": posts.map(post => ({
                            "@type": "BlogPosting",
                            "headline": post.title,
                            "datePublished": post.created_at,
                            "author": {
                                "@type": "Organization",
                                "name": post.author
                            }
                        }))
                    })
                }}
            />

            {/* Close Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-all duration-200 z-50 rounded-none hover:bg-muted"
                aria-label="Close blog page"
            >
                <X className="h-6 w-6" />
            </Button>

            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-16">
                    <div className="section-label mb-6">
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'hsl(var(--muted))' }} className="flex items-center gap-3 w-full">
                            RESOURCES / BLOG
                            <span className="flex-1 h-[1px] bg-border ml-2 block"></span>
                            <span className="section-number" style={{ fontFamily: '"VT323", monospace', fontSize: '48px', color: 'hsl(var(--border))', lineHeight: 1, marginTop: '-8px' }}>BL</span>
                        </span>
                    </div>
                    <h1 className="text-5xl sm:text-6xl tracking-tight text-foreground mb-4 font-display uppercase">
                        Product Intelligence
                    </h1>
                    <p className="text-base font-mono text-muted-foreground max-w-2xl leading-relaxed">
                        Guides, insights, and research on shipping better products through rapid validation and data-driven user personas.
                    </p>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center space-y-4">
                            <div className="w-6 h-6 border-2 border-foreground border-t-transparent animate-spin mx-auto"></div>
                            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Loading posts...</p>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="border border-[#c0392b] bg-[#c0392b]/10 p-6 text-center">
                        <p className="font-mono text-sm text-[#c0392b]">{error}</p>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setRetryCount(c => c + 1); loadPage(page); }}
                            className="mt-4 font-mono text-[11px] uppercase tracking-widest rounded-none"
                        >
                            ▸ RETRY
                        </Button>
                    </div>
                )}

                {/* Blog Grid */}
                {!loading && !error && (
                    <>
                        <div className="grid grid-cols-1 gap-8">
                            {posts.map((post) => (
                                <article
                                    key={post.slug}
                                    className="bg-card border border-border p-8 relative hover:border-foreground transition-colors duration-300 cursor-pointer group"
                                    onClick={() => navigate(`/blog/${post.slug}`)}
                                >
                                    {/* Card Accent */}
                                    <div className="absolute top-[-1px] left-[-1px] w-6 h-6 border-t-2 border-l-2 border-foreground"></div>

                                    {/* Tags */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {post.tags.map(tag => (
                                            <span key={tag} className="inline-block border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground group-hover:text-[#4a7c59] transition-colors">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <h2 className="text-3xl font-display mb-3 text-foreground group-hover:text-primary transition-colors">
                                        {post.title}
                                    </h2>

                                    <p className="text-sm text-foreground/80 mb-6 font-mono leading-relaxed max-w-3xl">
                                        {post.description}
                                    </p>

                                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
                                        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                                            <span>{post.author}</span>
                                            <span>·</span>
                                            <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                                            <span>·</span>
                                            <span>{post.read_time}</span>
                                        </div>
                                        <div className="text-[11px] font-mono font-bold text-foreground group-hover:text-[#1a4a7a] transition-colors">
                                            ▸ READ_MORE
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-12 pt-8 border-t border-border">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => loadPage(Math.max(1, page - 1))}
                                    disabled={page <= 1}
                                    className="font-mono text-[11px] uppercase tracking-widest rounded-none disabled:opacity-30"
                                >
                                    ▸ PREV
                                </Button>
                                <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
                                    Page {page} of {totalPages}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => loadPage(Math.min(totalPages, page + 1))}
                                    disabled={page >= totalPages}
                                    className="font-mono text-[11px] uppercase tracking-widest rounded-none disabled:opacity-30"
                                >
                                    NEXT ◂
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
