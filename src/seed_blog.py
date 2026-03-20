"""
Seed script to populate the blog_posts table with initial articles.

Run from the project root:
    python -m src.seed_blog
"""
import json
from datetime import datetime, timezone
from sqlmodel import Session, select
from src.database import engine, create_db_and_tables
from src.models import BlogPost


SEED_POSTS = [
    {
        "slug": "what-are-user-personas-and-why-do-they-matter",
        "title": "What Are User Personas and Why Do They Matter?",
        "description": "A comprehensive guide to understanding user personas, their importance in product development, and how they bridge the gap between assumptions and reality.",
        "author": "Pehloo Research",
        "read_time": "6 min read",
        "tags": json.dumps(["UX Research", "Product Strategy", "Beginner"]),
        "meta_title": "What Are User Personas? Guide to UX Personas | Pehloo",
        "meta_description": "Learn what user personas are, why they matter for product development, and how to use them to build better software.",
        "created_at": datetime(2026, 3, 1, tzinfo=timezone.utc),
        "content": """
      <h2>The Foundational Problem of Building Products</h2>
      <p>Every day, talented engineering teams write brilliant code that solves the wrong problem. They build features no one asked for, optimize workflows that users don't care about, and ship products that fall flat on launch day.</p>
      <p>Why does this happen? Because they built the product for themselves, not their users.</p>

      <h2>What is a User Persona?</h2>
      <p>A user persona is a semi-fictional archetype that represents the key traits of a large segment of your audience, based on the data you've collected from user research and web analytics. It is not just a demographic profile ("a 35-year-old manager"); it is a behavioral profile.</p>
      <ul>
        <li><strong>Goals:</strong> What are they trying to achieve?</li>
        <li><strong>Frustrations:</strong> What roadblocks currently stop them?</li>
        <li><strong>Behaviors:</strong> How do they interact with technology?</li>
        <li><strong>Environment:</strong> Where and when will they use your product?</li>
      </ul>

      <h2>Why Do Personas Matter?</h2>
      <p>Personas act as a tie-breaker. When the product team argues about whether to add a complex filtering system or a simple search bar, the persona decides. If your primary persona is a power-user data analyst, you build the filters. If the persona is an on-the-go sales rep on mobile, you build the search bar.</p>

      <h3>1. Empathy Over Assumptions</h3>
      <p>It's easy to assume your users know what an API token is. A persona reminds you that "Sarah, the non-technical marketing director" does not, and she needs a one-click integration instead.</p>

      <h3>2. Focused Execution</h3>
      <p>You can't build everything for everyone. Personas force prioritization.</p>

      <h2>The Danger of Outdated Personas</h2>
      <p>A persona is essentially a snapshot in time. The biggest mistake teams make is creating beautiful PDF personas in 2022 and assuming they still apply in 2026. Your market evolves, your competitors release new tools, and your users' expectations shift.</p>
      <p>This is where automated persona generation and continuous validation come in—turning static PDFs into living data.</p>
        """,
    },
    {
        "slug": "how-to-create-data-driven-user-personas",
        "title": "How to Create Data-Driven User Personas",
        "description": "Move beyond guesswork. Learn the step-by-step process of creating accurate user personas using quantitative data and qualitative insights.",
        "author": "Pehloo Research",
        "read_time": "8 min read",
        "tags": json.dumps(["UX Research", "Data Analysis", "Guide"]),
        "meta_title": "How to Create Data-Driven User Personas in 5 Steps | Pehloo",
        "meta_description": "Master the art of creating accurate, data-driven user personas with our comprehensive step-by-step guide for product teams.",
        "created_at": datetime(2026, 3, 5, tzinfo=timezone.utc),
        "content": """
      <h2>Stop Guessing. Start Measuring.</h2>
      <p>The traditional way to build a user persona involves a marketing team sitting in a conference room, staring at a whiteboard, and inventing a character named "Startup Steve." This approach is dangerous. It embeds your own biases into the very document that is supposed to guide your product strategy.</p>

      <h2>Step 1: Gather Quantitative Data (The "What")</h2>
      <p>Start with the numbers. Analytics tools will tell you what people are doing on your site or in your app.</p>
      <ul>
        <li><strong>Traffic Sources:</strong> Where are they coming from?</li>
        <li><strong>Feature Usage:</strong> What buttons do they never click?</li>
        <li><strong>Drop-off Points:</strong> Where do they abandon the funnel?</li>
      </ul>

      <h2>Step 2: Gather Qualitative Data (The "Why")</h2>
      <p>Metrics tell you what happened. Conversations tell you why. You need to talk to real users.</p>
      <ul>
        <li>Conduct 1-on-1 user interviews.</li>
        <li>Read support tickets and bug reports.</li>
        <li>Analyze sales call transcripts.</li>
      </ul>

      <h2>Step 3: Identify Patterns</h2>
      <p>As you review your data, group users by their behaviors and goals, not just their job titles. You might find that a Junior Developer and a Senior Product Manager use your tool in the exact same way—they share a behavioral persona despite different demographics.</p>

      <h2>Step 4: Draft the Persona Document</h2>
      <p>Keep it concise. A useful persona should fit on one page. Include:</p>
      <ul>
        <li>Name & Role (make it memorable)</li>
        <li>Core Goals (what does "success" look like?)</li>
        <li>Pain Points (what makes them want to quit?)</li>
        <li>Technical Comfort Level</li>
      </ul>

      <h2>Step 5: Validate and Iterate</h2>
      <p>A persona is a hypothesis. Test it against reality. As you launch new features, measure whether the users who match your persona respond the way you predicted. If not, update the persona.</p>
      <p><em>Or, you could skip the manual weeks of research and let Pehloo's PersonaForge generate data-driven personas in 10 minutes.</em></p>
        """,
    },
    {
        "slug": "ai-powered-persona-generation-future-ux",
        "title": "AI-Powered Persona Generation: The Future of UX Research",
        "description": "How artificial intelligence is transforming UX research, making persona generation faster, more accurate, and more accessible to all teams.",
        "author": "Pehloo Engineering",
        "read_time": "5 min read",
        "tags": json.dumps(["AI", "Future of Work", "Product Strategy"]),
        "meta_title": "AI Persona Generation: The Future of UX Research | Pehloo",
        "meta_description": "Discover how AI is revolutionizing UX research by automating user persona generation and making data-driven insights accessible in minutes.",
        "created_at": datetime(2026, 3, 8, tzinfo=timezone.utc),
        "content": """
      <h2>The Speed Problem in UX Research</h2>
      <p>Traditional UX research is fundamentally incompatible with the speed of modern agile development. By the time a research team spends six weeks interviewing users, synthesizing data, and publishing a persona report, the engineering team has already shipped two new features.</p>
      <p>This creates a painful choice: build slow with data, or build fast with guesses.</p>

      <h2>Enter LLMs and AI Agents</h2>
      <p>Large Language Models (LLMs) have changed the equation. Because models are trained on vast amounts of internet data—including forums, reviews, social media, and industry discussions—they possess an incredibly deep understanding of human behavior, pain points, and professional workflows.</p>

      <h3>How AI Persona Generation Works</h3>
      <p>Instead of manually synthesizing weeks of interview transcripts, tools like Pehloo's PersonaForge allow you to input a product concept, target market, and problem statement. The AI then acts as an expert synthesizer, instantly generating deeply realistic personas that map to your constraints.</p>

      <h2>The Benefits of AI Personas</h2>
      <ul>
        <li><strong>Speed:</strong> Go from blank page to 6 detailed personas in 10 minutes.</li>
        <li><strong>Unbiased Baselines:</strong> AI can highlight edge cases and user types you might have overlooked.</li>
        <li><strong>Living Documents:</strong> As your product pivots, you can instantly regenerate personas to match the new direction.</li>
      </ul>

      <h2>AI as a Starting Point, Not an Endpoint</h2>
      <p>AI personas don't replace talking to your users. They replace the cold start problem. They give you a highly accurate hypothesis from day one, so when you do conduct user interviews, you're validating a mature model rather than starting from scratch.</p>
        """,
    },
    {
        "slug": "5-common-mistakes-user-personas",
        "title": "5 Common Mistakes When Creating User Personas",
        "description": "Avoid these critical errors that turn useful user personas into ignored PDF documents gathering dust on a shared drive.",
        "author": "Pehloo Research",
        "read_time": "7 min read",
        "tags": json.dumps(["UX Research", "Common Mistakes", "Beginner"]),
        "meta_title": "5 Common Mistakes When Creating User Personas | Pehloo",
        "meta_description": "Avoid the 5 biggest mistakes product teams make when creating user personas. Learn how to build actionable, useful user profiles.",
        "created_at": datetime(2026, 3, 10, tzinfo=timezone.utc),
        "content": """
      <h2>The "Forgotten PDF" Syndrome</h2>
      <p>We've all seen them: beautiful, highly-designed persona documents that the team looks at exactly once before burying them in a Google Drive folder forever. Why do personas fail to gain traction in product teams? Usually, it's because of these five mistakes.</p>

      <h3>1. Focusing Too Much on Demographics</h3>
      <p>Knowing that "Startup Steve" is 32, drives a Honda, and has a golden retriever does not help your engineering team decide how to design an API schema. Focus on <strong>behavior and goals</strong>, not personal trivia.</p>

      <h3>2. Creating Too Many Personas</h3>
      <p>If you have 15 primary personas, you have zero primary personas. You cannot prioritize features if every possible user type is treated as equal. Stick to 3–5 core personas.</p>

      <h3>3. Building the "Ideal" User Instead of the Real User</h3>
      <p>Teams often create personas who are perfectly logical, infinitely patient, and obsessed with the product. Real users are distracted, frustrated, and want to spend as little time in your app as possible. Document their impatience.</p>

      <h3>4. Not Updating Them</h3>
      <p>Your product changed. Your market changed. Your competitors deployed AI features. If your personas haven't been updated since 2024, they are actively lying to you.</p>

      <h3>5. Keeping Them Locked in the UX Department</h3>
      <p>Engineers, marketers, and sales teams all need the personas. If they aren't accessible and easily referenced (like in a quick terminal command or a shared digital space), they won't be used to make decisions.</p>
        """,
    },
    {
        "slug": "user-personas-vs-buyer-personas",
        "title": "User Personas vs. Buyer Personas: What's the Difference?",
        "description": "A breakdown of the critical differences between the people who use your product and the people who pay for it.",
        "author": "Pehloo Product",
        "read_time": "5 min read",
        "tags": json.dumps(["Product Strategy", "B2B", "Marketing"]),
        "meta_title": "User Personas vs Buyer Personas: Understanding the Difference | Pehloo",
        "meta_description": "Confused about user personas vs buyer personas? Learn the key differences and why B2B SaaS teams need both to succeed.",
        "created_at": datetime(2026, 3, 12, tzinfo=timezone.utc),
        "content": """
      <h2>The B2B SaaS Dilemma</h2>
      <p>In consumer apps, the user and the buyer are the same person. You pay for Spotify, and you listen to Spotify. But in B2B software, the person clicking the buttons is rarely the person signing the checks. This is why you need both User Personas and Buyer Personas.</p>

      <h2>The Buyer Persona</h2>
      <p>The Buyer Persona (e.g., the VP of Engineering, the CFO) cares about business outcomes. They don't care about your slick UI or dark mode. They care about:</p>
      <ul>
        <li><strong>ROI:</strong> Will this save us money or make us money?</li>
        <li><strong>Security & Compliance:</strong> Will this get us sued?</li>
        <li><strong>Time-to-Value:</strong> How long until we see results?</li>
      </ul>
      <p><em>Marketing and Sales use Buyer Personas to write landing pages and pitches.</em></p>

      <h2>The User Persona</h2>
      <p>The User Persona (e.g., the Junior Developer, the Content Writer) has to actually use your software eight hours a day. They care about:</p>
      <ul>
        <li><strong>Efficiency:</strong> Does this eliminate busywork?</li>
        <li><strong>Reliability:</strong> Is it fast and bug-free?</li>
        <li><strong>Experience:</strong> Is it infuriating to use?</li>
      </ul>
      <p><em>Product and Engineering use User Personas to build features and design interfaces.</em></p>

      <h2>The Fatal Mistake: Building for the Buyer, Not the User</h2>
      <p>If you only optimize for the Buyer Persona, you end up with enterprise software that looks great on a spreadsheet but is universally hated by the employees forced to use it. Eventually, low adoption rates will cause the Buyer to churn anyway.</p>
      <p>You must sell to the Buyer, but build for the User.</p>
        """,
    },
]


def seed_blog_posts():
    create_db_and_tables()

    with Session(engine) as session:
        for post_data in SEED_POSTS:
            # Skip if already exists
            existing = session.exec(
                select(BlogPost).where(BlogPost.slug == post_data["slug"])
            ).first()

            if existing:
                print(f"  Skipping (exists): {post_data['slug']}")
                continue

            post = BlogPost(
                **post_data,
                updated_at=post_data["created_at"],
            )
            session.add(post)
            print(f"  Added: {post_data['slug']}")

        session.commit()
        print("\nBlog seed complete.")


if __name__ == "__main__":
    seed_blog_posts()
