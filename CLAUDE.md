# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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