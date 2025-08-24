## Who Is My User? — AI-Powered Persona Generator

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue)](https://www.python.org/downloads/release/python-3120/) [![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688)](https://fastapi.tiangolo.com/) [![Google Gemini](https://img.shields.io/badge/Google-Gemini%20AI-4285F4)](https://ai.google.dev/) [![uv](https://img.shields.io/badge/deps-uv%20managed-5C4EE5)](https://docs.astral.sh/uv/)

Generate rich, research-ready user personas from a short product description. Backend is implemented with FastAPI and uses Google's Gemini AI for structured JSON output. A React frontend is planned with an Artifacts-style split interface.

### Key Features
- **AI persona generation**: Structured JSON output with strict schema validation
- **FastAPI backend**: Simple REST endpoints with clear error handling
- **.env based configuration**: Bring your own `GOOGLE_API_KEY`
- **Planned frontend**: React + TypeScript with shadcn/ui and export to PDF

---

## Quickstart

### Prerequisites
- Python >= 3.12
- A Google API key with access to Gemini models
- Recommended: `uv` for dependency management

### Setup
```bash
# From the project root
cd who-is-my-user

# Install dependencies (uses pyproject.toml + uv.lock)
uv sync

# Configure environment
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

### Run the API server
```bash
# Option 1: Python entrypoint with autoreload
python src/main.py

# Option 2: Uvicorn directly
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

Open the interactive API docs:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Try it
```bash
curl -sS -X POST http://localhost:8000/generate-personas \
  -H 'Content-Type: application/json' \
  -d '{"text":"An AI note-taking app for busy product managers that summarizes meetings and drafts action items."}' | jq
```

### Standalone generator (no server)
```bash
python src/generator.py
```

---

## API

### Endpoints
- `GET /` — API info
- `GET /health` — Health check
- `POST /generate-personas` — Generate personas from text

### Request
```json
{
  "text": "Short product description or concept"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "personas": [
      {
        "name": "string",
        "status": "primary | secondary",
        "role": "string",
        "demographics": {
          "age": "string",
          "location": "string",
          "education": "string",
          "industry": "string"
        },
        "goals": ["string"],
        "frustrations": ["string"],
        "behavioral_patterns": ["string"],
        "tech_comfort": "low | medium | high",
        "scenario_context": "string",
        "influence_networks": ["string"],
        "recruitment_criteria": ["string"],
        "research_assumptions": ["string"]
      }
    ]
  },
  "message": "Successfully generated N personas"
}
```

### Errors
- `400` — Empty `text`
- `500` — Downstream model error or schema validation failure

---

## How it works
1. FastAPI validates input and routes to the generator (`src/main.py`)
2. Gemini API is called with a refined system prompt (`src/generator.py` uses `refined_generation_prompt` from `src/prompts.py`)
3. Raw model output is parsed and validated against a strict schema (`parse_json` in `src/generator.py`)
4. The API returns a normalized, predictable JSON structure

---

## Configuration

The backend reads configuration from environment variables (via `python-dotenv`).

- `GOOGLE_API_KEY` (required): Your Gemini API key

### CORS (for frontend dev)
Add this to `src/main.py` when integrating a local frontend (Vite default port shown):
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Project structure
```
who-is-my-user/
├─ src/
│  ├─ main.py          # FastAPI app + endpoints
│  ├─ generator.py     # Gemini client, parsing, schema validation
│  └─ prompts.py       # Refined system prompt(s)
├─ pyproject.toml      # Dependencies (managed by uv)
├─ uv.lock             # Locked dependency versions
├─ README.md
└─ CLAUDE.md           # Additional development guidance
```

---

## Frontend (planned)

Planned React + TypeScript interface with shadcn/ui:
- Split interface: chat input on the left, editable persona cards on the right
- File uploads: PDF, image, markdown with client-side preprocessing
- Modes: quick, think hard, do my homework
- Export personas to PDF

Initial scaffold (to be created in `frontend/`):
```bash
mkdir frontend && cd frontend
npm create vite@latest . -- --template react-ts
npm install

# shadcn/ui and common components
npx shadcn@latest init
npx shadcn@latest add button card input form select textarea

# State and utilities
npm install zustand react-dropzone jspdf html2canvas axios @tanstack/react-query clsx tailwind-merge lucide-react
```

---

## Development
- Format and type-check using your editor setup; keep code readable and small functions
- Prefer explicit types for public APIs and clear error handling
- Secrets stay in `.env` and are never committed

---

## Roadmap
- File upload API (PDF/image/markdown processing)
- Mode selection parameter (`quick | think_hard | homework`)
- Enhanced error responses with detailed validation messages
- Streaming responses for long-running generations
- Frontend implementation and integration

---

## Contributing
Issues and PRs are welcome. Please describe your change clearly and include minimal repro steps or tests when applicable.

---

## Acknowledgements
- FastAPI for the web framework
- Google Gemini for model capabilities
- uv for fast, reproducible Python environments


