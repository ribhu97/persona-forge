# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Navigation — MANDATORY

You MUST use token-savior MCP tools FIRST.

- ALWAYS start with: find_symbol, get_function_source, get_class_source,
  search_codebase, get_dependencies, get_dependents, get_change_impact
- Only fall back to Read/Grep when token-savior tools genuinely don't cover it
- If you catch yourself reaching for grep to find code, STOP

## Project Overview

This is a full-stack User Persona Generator application with a FastAPI backend and React frontend. The application uses Google's Gemini AI to create detailed user personas from product descriptions and file uploads, featuring an intuitive Claude Artifacts-style interface.

### Backend Architecture

- **FastAPI Application** (`src/main.py`): REST API with endpoints for persona generation and health checks
- **Persona Generation** (`src/generator.py`): Core logic using Google Gemini API with structured JSON output
- **Prompt Engineering** (`src/prompts.py`): Contains refined prompts optimized for persona generation
- **Environment Configuration**: Uses `.env` file for API keys (Google API key required)

### Frontend Architecture (Planned)

- **React + TypeScript**: Modern React with shadcn/ui components
- **Split Interface**: Chat-style input on left, editable persona cards on right
- **File Upload Support**: PDF, images, markdown with client-side processing
- **Generation Modes**: Quick, Think Hard, Do My Homework options
- **Export Capabilities**: PDF export of generated personas
- **State Management**: Zustand for efficient state handling
- **Responsive Design**: Tailwind CSS with mobile-first approach

## Development Commands

### Backend Setup and Dependencies
```bash
# Install backend dependencies using uv
uv sync

# Create .env file with required API key
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

### Frontend Setup (when implemented)
```bash
# Create frontend directory and initialize
mkdir frontend && cd frontend
npm create vite@latest . -- --template react-ts
npm install

# Install shadcn/ui and dependencies
npx shadcn@latest init
npx shadcn@latest add button card input form select textarea
npm install zustand react-dropzone jspdf html2canvas axios

# Install additional utilities
npm install @tanstack/react-query clsx tailwind-merge lucide-react
```

### Running the Application
```bash
# Backend: Run FastAPI server with hot reload
python src/main.py

# Alternative: Run with uvicorn directly
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend: Run development server (when implemented)
cd frontend && npm run dev

# Run standalone generator for testing
python src/generator.py
```

### API Endpoints
- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint  
- `POST /generate-personas` - Main endpoint accepting `{"text": "product description"}`

## Key Implementation Details

### Persona Generation Flow
1. Input validation in FastAPI endpoint (`src/main.py:36-68`)
2. Gemini API call with structured prompt (`src/generator.py:105-161`)
3. JSON parsing with strict schema validation (`src/generator.py:10-103`)
4. Return structured response with success/failure status

### Schema Validation
The application enforces a strict persona schema with required fields:
- Demographics (age, location, education, industry)
- Goals, frustrations, behavioral patterns (arrays)
- Tech comfort levels (low/medium/high)
- Research recruitment criteria and assumptions

### Error Handling
- Input validation for empty text
- JSON parsing with fallback to empty dict
- Schema validation against expected persona structure
- HTTP exception handling with detailed error messages

## Frontend Integration Notes

### CORS Configuration
Add CORS middleware to `src/main.py` for frontend integration:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### API Extensions Needed for Frontend
- File upload endpoint for PDF/image/markdown processing
- Mode selection parameter (quick/think_hard/homework)
- Enhanced error responses with detailed validation messages
- Streaming responses for long-running generation tasks

<!-- dgc-policy-v11 -->
# Dual-Graph Context Policy

This project uses a local dual-graph MCP server for efficient context retrieval.

## MANDATORY: Always follow this order

1. **Call `graph_continue` first** — before any file exploration, grep, or code reading.

2. **If `graph_continue` returns `needs_project=true`**: call `graph_scan` with the
   current project directory (`pwd`). Do NOT ask the user.

3. **If `graph_continue` returns `skip=true`**: project has fewer than 5 files.
   Do NOT do broad or recursive exploration. Read only specific files if their names
   are mentioned, or ask the user what to work on.

4. **Read `recommended_files`** using `graph_read` — **one call per file**.
   - `graph_read` accepts a single `file` parameter (string). Call it separately for each
     recommended file. Do NOT pass an array or batch multiple files into one call.
   - `recommended_files` may contain `file::symbol` entries (e.g. `src/auth.ts::handleLogin`).
     Pass them verbatim to `graph_read(file: "src/auth.ts::handleLogin")` — it reads only
     that symbol's lines, not the full file.
   - Example: if `recommended_files` is `["src/auth.ts::handleLogin", "src/db.ts"]`,
     call `graph_read(file: "src/auth.ts::handleLogin")` and `graph_read(file: "src/db.ts")`
     as two separate calls (they can be parallel).

5. **Check `confidence` and obey the caps strictly:**
   - `confidence=high` -> Stop. Do NOT grep or explore further.
   - `confidence=medium` -> If recommended files are insufficient, call `fallback_rg`
     at most `max_supplementary_greps` time(s) with specific terms, then `graph_read`
     at most `max_supplementary_files` additional file(s). Then stop.
   - `confidence=low` -> Call `fallback_rg` at most `max_supplementary_greps` time(s),
     then `graph_read` at most `max_supplementary_files` file(s). Then stop.

## Token Usage

A `token-counter` MCP is available for tracking live token usage.

- To check how many tokens a large file or text will cost **before** reading it:
  `count_tokens({text: "<content>"})`
- To log actual usage after a task completes (if the user asks):
  `log_usage({input_tokens: <est>, output_tokens: <est>, description: "<task>"})`
- To show the user their running session cost:
  `get_session_stats()`

Live dashboard URL is printed at startup next to "Token usage".

## Rules

- Do NOT use `rg`, `grep`, or bash file exploration before calling `graph_continue`.
- Do NOT do broad/recursive exploration at any confidence level.
- `max_supplementary_greps` and `max_supplementary_files` are hard caps - never exceed them.
- Do NOT dump full chat history.
- Do NOT call `graph_retrieve` more than once per turn.
- After edits, call `graph_register_edit` with the changed files. Use `file::symbol` notation (e.g. `src/auth.ts::handleLogin`) when the edit targets a specific function, class, or hook.

## Context Store

Whenever you make a decision, identify a task, note a next step, fact, or blocker during a conversation, call `graph_add_memory`.

**To add an entry:**
```
graph_add_memory(type="decision|task|next|fact|blocker", content="one sentence max 15 words", tags=["topic"], files=["relevant/file.ts"])
```

**Do NOT write context-store.json directly** — always use `graph_add_memory`. It applies pruning and keeps the store healthy.

**Rules:**
- Only log things worth remembering across sessions (not every minor detail)
- `content` must be under 15 words
- `files` lists the files this decision/task relates to (can be empty)
- Log immediately when the item arises — not at session end

## Session End

When the user signals they are done (e.g. "bye", "done", "wrap up", "end session"), proactively update `CONTEXT.md` in the project root with:
- **Current Task**: one sentence on what was being worked on
- **Key Decisions**: bullet list, max 3 items
- **Next Steps**: bullet list, max 3 items

Keep `CONTEXT.md` under 20 lines total. Do NOT summarize the full conversation — only what's needed to resume next session.
