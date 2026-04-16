import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X, ArrowLeft } from 'lucide-react';
import { blogAPI } from '@/lib/api';
import type { BlogPostFull } from '@/lib/api';
import { useNavigate, useParams, useLoaderData } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

interface BlogPostPageProps {
    className?: string;
}

export function BlogPostPage({ className }: BlogPostPageProps) {
    const { slug = '' } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const loaderPost = useLoaderData() as BlogPostFull | null | undefined;

    const [post, setPost] = useState<BlogPostFull | null>(loaderPost ?? null);
    const [loading, setLoading] = useState(!loaderPost);
    const [error, setError] = useState<string | null>(null);

    // Fetch client-side only if loader didn't supply the post (e.g., client-side nav)
    useEffect(() => {
        if (loaderPost) return;
        setLoading(true);
        setError(null);
        blogAPI.getBySlug(slug)
            .then((data) => setPost(data))
            .catch((err) => {
                console.error('Failed to fetch blog post:', err);
                setError('Blog post not found.');
            })
            .finally(() => setLoading(false));
    }, [slug, loaderPost]);

    // Loading state
    if (loading) {
        return (
            <div className={cn("min-h-screen bg-background flex items-center justify-center", className)}>
                <div className="text-center space-y-4">
                    <div className="w-6 h-6 border-2 border-foreground border-t-transparent animate-spin mx-auto"></div>
                    <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Loading article...</p>
                </div>
            </div>
        );
    }

    // Error / not found state
    if (error || !post) {
        return (
            <div className={cn("min-h-screen bg-background flex items-center justify-center", className)}>
                <div className="text-center space-y-4">
                    <p className="font-mono text-sm text-[#c0392b] uppercase tracking-widest">{error || 'Post not found'}</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/blog')}
                        className="font-mono text-[11px] uppercase tracking-widest rounded-none"
                    >
                        ▸ BACK_TO_BLOG
                    </Button>
                </div>
            </div>
        );
    }

    const siteUrl = import.meta.env.VITE_SITE_URL ?? 'https://personaforge.pehloo.xyz';
    const canonicalUrl = `${siteUrl}/blog/${slug}`;

    return (
        <div className={cn(
            "min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8 relative overflow-x-hidden",
            className
        )}>
            <Helmet>
                <title>{post.meta_title}</title>
                <meta name="description" content={post.meta_description} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={post.meta_title} />
                <meta property="og:description" content={post.meta_description} />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:type" content="article" />
                <meta name="twitter:card" content="summary" />
                <meta name="twitter:title" content={post.meta_title} />
                <meta name="twitter:description" content={post.meta_description} />
            </Helmet>

            {/* JSON-LD Structured Data for Individual Post */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "BlogPosting",
                        "mainEntityOfPage": {
                            "@type": "WebPage",
                            "@id": canonicalUrl
                        },
                        "headline": post.meta_title,
                        "description": post.meta_description,
                        "author": {
                            "@type": "Organization",
                            "name": post.author
                        },
                        "publisher": {
                            "@type": "Organization",
                            "name": "Pehloo",
                            "logo": {
                                "@type": "ImageObject",
                                "url": "https://pehloo.com/logo.png"
                            }
                        },
                        "datePublished": post.created_at,
                        "dateModified": post.updated_at
                    })
                }}
            />

            {/* Back & Close Nav */}
            <div className="absolute top-4 left-4 right-4 flex justify-between z-50 pointer-events-none">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/blog')}
                    className="pointer-events-auto text-muted-foreground hover:text-foreground font-mono text-[11px] uppercase tracking-widest rounded-none"
                    style={{ background: 'var(--background)' }}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    ▸ BACK_TO_BLOG
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/')}
                    className="pointer-events-auto text-muted-foreground hover:text-foreground hover:bg-muted rounded-none"
                    style={{ background: 'var(--background)' }}
                    aria-label="Close blog"
                >
                    <X className="h-6 w-6" />
                </Button>
            </div>

            <article className="max-w-3xl mx-auto mt-8">
                {/* Article Header */}
                <header className="mb-12 border-b border-border pb-10">
                    <div className="flex flex-wrap gap-2 mb-6">
                        {post.tags.map(tag => (
                            <span key={tag} className="inline-block border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-[#4a7c59] bg-card">
                                {tag}
                            </span>
                        ))}
                    </div>

                    <h1 className="text-4xl sm:text-5xl font-display mb-6 leading-tight">
                        {post.title}
                    </h1>

                    <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground bg-black text-white inline-block px-4 py-2">
                        <span>AUTHOR: {post.author}</span>
                        <span className="mx-3 opacity-50">|</span>
                        <time dateTime={post.created_at}>DATE: {new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                        <span className="mx-3 opacity-50">|</span>
                        <span>{post.read_time}</span>
                    </div>
                </header>

                {/* Article Content */}
                {/*
                  * Note: dangerouslySetInnerHTML is used here to render the HTML structure of the blog post.
                  * XSS Risk: High if content is user-generated.
                  * Trust Assumption: Blog content is exclusively sourced from trusted admins/internal DB seeds,
                  * so it is considered safe. If user-generated content is ever allowed, this MUST be sanitized.
                  */}
                <div
                    className="prose prose-lg max-w-none
                        prose-headings:font-display prose-headings:font-normal prose-headings:mt-14 prose-headings:mb-8 prose-headings:text-foreground
                        prose-h2:text-4xl prose-h3:text-3xl
                        prose-p:font-mono prose-p:text-base prose-p:leading-relaxed prose-p:mb-8 prose-p:text-foreground/90
                        prose-ul:font-mono prose-ul:text-base prose-ul:my-8 prose-ul:list-disc prose-ul:ml-6 prose-ul:pl-2
                        prose-li:mb-3 prose-li:text-foreground/90 prose-li:marker:text-foreground
                        prose-strong:font-bold prose-strong:text-foreground prose-strong:border-b-2 prose-strong:border-foreground/30
                        prose-em:italic
                        selection:bg-[#1a4a7a] selection:text-white"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                />

                {/* CTA Footer */}
                <footer className="mt-20 border-l-4 border-black bg-card p-8">
                    <h3 className="font-display text-2xl mb-3">Stop Guessing. Start Building.</h3>
                    <p className="font-sans text-sm text-foreground/80 mb-6 max-w-xl leading-relaxed">
                        Don't let bad assumptions ruin good products. Generate perfectly calibrated, data-driven user personas in 10 minutes.
                    </p>
                    <Button
                        onClick={() => navigate('/')}
                        className="rounded-none bg-[#27ae60] hover:bg-[#27ae60]/90 text-white font-mono text-[11px] tracking-widest uppercase font-bold"
                    >
                        ▸ TRY_PERSONA_FORGE
                    </Button>
                </footer>
            </article>
        </div>
    );
}
