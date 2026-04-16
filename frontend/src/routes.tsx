import type { RouteRecord } from 'vite-react-ssg'
import type { LoaderFunctionArgs } from 'react-router-dom'

// Lazy imports for page components (reduces initial bundle)
import AppLayout from './App'
import { MainAppView } from './components/MainAppView'
import { BlogListPage } from './components/blog/BlogListPage'
import { BlogPostPage } from './components/blog/BlogPostPage'
import { PricingPage } from './components/pricing/PricingPage'
import { PrivacyPolicyPage } from './components/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from './components/legal/TermsOfServicePage'

// Blog loaders — use fs at build/SSR time, fetch API at client runtime
async function blogListLoader() {
  if (import.meta.ssr) {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const dataPath = resolve(process.cwd(), '.generated/blog-posts.json')
    const posts = JSON.parse(readFileSync(dataPath, 'utf-8'))
    // Return summaries (no content field) for the list page
    return posts.map(({ content: _content, ...summary }: any) => summary)
  }
  // Client-side: fetch from API
  const res = await fetch('/api/blog/?page=1&page_size=50')
  if (!res.ok) return []
  const data = await res.json()
  return data.posts ?? []
}

async function blogPostLoader({ params }: LoaderFunctionArgs) {
  const { slug } = params
  if (import.meta.ssr) {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const dataPath = resolve(process.cwd(), '.generated/blog-posts.json')
    const posts = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return posts.find((p: any) => p.slug === slug) ?? null
  }
  // Client-side: fetch from API
  const res = await fetch(`/api/blog/${slug}`)
  if (!res.ok) return null
  return res.json()
}

function getBlogSlugs(): string[] {
  try {
    const { readFileSync } = require('fs')
    const { resolve } = require('path')
    const dataPath = resolve(process.cwd(), '.generated/blog-posts.json')
    const posts = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return posts.map((p: any) => `/blog/${p.slug}`)
  } catch {
    return []
  }
}

export const routes: RouteRecord[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <MainAppView />,
      },
      {
        path: 'blog',
        element: <BlogListPage />,
        loader: blogListLoader,
      },
      {
        path: 'blog/:slug',
        element: <BlogPostPage />,
        loader: blogPostLoader,
        getStaticPaths: getBlogSlugs,
      },
      {
        path: 'pricing',
        element: <PricingPage />,
      },
      {
        path: 'privacy',
        element: <PrivacyPolicyPage />,
      },
      {
        path: 'terms',
        element: <TermsOfServicePage />,
      },
    ],
  },
]
