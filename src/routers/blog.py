import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func

from src.database import get_session
from src.models import BlogPost
from src.schemas import BlogPostResponse, BlogPostSummary, BlogListResponse

router = APIRouter(prefix="/blog", tags=["blog"])


def _to_tags_list(tags_str: str) -> list[str]:
    """Convert comma-separated tags string to a list."""
    return [t.strip() for t in tags_str.split(",") if t.strip()]


def _post_to_summary(post: BlogPost) -> BlogPostSummary:
    return BlogPostSummary(
        id=post.id,
        slug=post.slug,
        title=post.title,
        description=post.description,
        author=post.author,
        read_time=post.read_time,
        tags=_to_tags_list(post.tags),
        meta_title=post.meta_title,
        meta_description=post.meta_description,
        created_at=post.created_at,
    )


def _post_to_response(post: BlogPost) -> BlogPostResponse:
    return BlogPostResponse(
        id=post.id,
        slug=post.slug,
        title=post.title,
        description=post.description,
        author=post.author,
        read_time=post.read_time,
        tags=_to_tags_list(post.tags),
        content=post.content,
        meta_title=post.meta_title,
        meta_description=post.meta_description,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.get("/", response_model=BlogListResponse)
def list_blog_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    session: Session = Depends(get_session),
):
    """List published blog posts with pagination (public, no auth required)."""
    # Total count
    count_stmt = select(func.count()).select_from(BlogPost).where(BlogPost.is_published == True)
    total = session.exec(count_stmt).one()

    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size

    stmt = (
        select(BlogPost)
        .where(BlogPost.is_published == True)
        .order_by(BlogPost.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    posts = session.exec(stmt).all()

    return BlogListResponse(
        posts=[_post_to_summary(p) for p in posts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{slug}", response_model=BlogPostResponse)
def get_blog_post(slug: str, session: Session = Depends(get_session)):
    """Get a single published blog post by slug (public, no auth required)."""
    stmt = select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)
    post = session.exec(stmt).first()

    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")

    return _post_to_response(post)
