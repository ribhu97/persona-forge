from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import Annotated, List
from datetime import datetime, timezone, timedelta
import json
import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_LEFT

from src.database import get_session
from src.models import User, Persona
from src.schemas import ExportRequest, ExportStatusResponse
from src.dependencies import get_current_user

router = APIRouter(prefix="/export", tags=["export"])

# Account type constants
ACCOUNT_FREE = 0
ACCOUNT_ADMIN = 1

# Export rate limit (30 days)
EXPORT_RATE_LIMIT_DAYS = 30


def check_export_eligibility(user: User) -> tuple[bool, int, datetime | None]:
    """
    Check if user can export.
    Returns: (can_export, exports_remaining, next_available_date)
    """
    # Admins have unlimited exports
    if user.account_type >= ACCOUNT_ADMIN:
        return True, -1, None  # -1 means unlimited
    
    # Free users: check last export date
    if user.last_export_at is None:
        return True, 1, None
    
    # Ensure last_export_at is aware for comparison (SQLite might return naive)
    last_export = user.last_export_at
    if last_export.tzinfo is None:
        last_export = last_export.replace(tzinfo=timezone.utc)
        
    # Calculate when next export is available
    next_available = last_export + timedelta(days=EXPORT_RATE_LIMIT_DAYS)
    
    if datetime.now(timezone.utc) >= next_available:
        return True, 1, None
    
    return False, 0, next_available


@router.get("/status", response_model=ExportStatusResponse)
async def get_export_status(
    user: Annotated[User, Depends(get_current_user)],
):
    """Get user's export eligibility status."""
    can_export, exports_remaining, next_available = check_export_eligibility(user)
    
    return ExportStatusResponse(
        can_export=can_export,
        account_type=user.account_type,
        exports_remaining=exports_remaining if exports_remaining >= 0 else 999,  # 999 for unlimited
        last_export_at=user.last_export_at,
        next_export_available=next_available
    )


def serialize_persona_for_export(persona: Persona) -> dict:
    """Convert a Persona model to a clean dictionary for export."""
    def get_ordered_text(items, text_attr):
        return [getattr(item, text_attr) for item in sorted(items, key=lambda x: x.order_index)]
    
    return {
        "name": persona.name,
        "status": persona.status,
        "role": persona.role,
        "tech_comfort": persona.tech_comfort,
        "scenario_context": persona.scenario_context,
        "demographics": {
            "age": persona.demographics.age if persona.demographics else None,
            "location": persona.demographics.location if persona.demographics else None,
            "education": persona.demographics.education if persona.demographics else None,
            "industry": persona.demographics.industry if persona.demographics else None,
        } if persona.demographics else {},
        "goals": get_ordered_text(persona.goals, "goal_text"),
        "frustrations": get_ordered_text(persona.frustrations, "frustration_text"),
        "behavioral_patterns": get_ordered_text(persona.behavioral_patterns, "pattern_text"),
        "influence_networks": get_ordered_text(persona.influence_networks, "network_text"),
        "recruitment_criteria": get_ordered_text(persona.recruitment_criteria, "criteria_text"),
        "research_assumptions": get_ordered_text(persona.research_assumptions, "assumption_text"),
    }


def generate_pdf(personas_data: List[dict], export_date: datetime) -> bytes:
    """Generate a nicely formatted PDF from personas data."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.75*inch, bottomMargin=1*inch)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        textColor=HexColor('#1a1a2e'),
        spaceAfter=20
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=HexColor('#16213e'),
        spaceBefore=20,
        spaceAfter=10
    )
    
    subheading_style = ParagraphStyle(
        'CustomSubheading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=HexColor('#0f3460'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#333333'),
        alignment=TA_LEFT,
        spaceAfter=4
    )
    
    badge_primary = ParagraphStyle(
        'BadgePrimary',
        parent=styles['Normal'],
        fontSize=9,
        textColor=HexColor('#1e40af'),
        backColor=HexColor('#dbeafe'),
    )
    
    badge_secondary = ParagraphStyle(
        'BadgeSecondary',
        parent=styles['Normal'],
        fontSize=9,
        textColor=HexColor('#7c3aed'),
        backColor=HexColor('#ede9fe'),
    )
    
    story = []
    
    # Title page
    story.append(Paragraph("User Personas Export", title_style))
    story.append(Paragraph(f"Generated on {export_date.strftime('%B %d, %Y at %H:%M')}", body_style))
    story.append(Paragraph(f"Total Personas: {len(personas_data)}", body_style))
    story.append(Spacer(1, 30))
    
    # Each persona
    for i, persona in enumerate(personas_data):
        if i > 0:
            story.append(Spacer(1, 20))
        
        # Name and status
        status_badge = "PRIMARY" if persona['status'] == 'primary' else "SECONDARY"
        story.append(Paragraph(f"{persona['name']}", heading_style))
        story.append(Paragraph(f"<b>{status_badge}</b> • {persona['role']}", body_style))
        story.append(Paragraph(f"Tech Comfort: {persona['tech_comfort'].capitalize()}", body_style))
        
        # Demographics
        if persona.get('demographics'):
            demo = persona['demographics']
            story.append(Paragraph("Demographics", subheading_style))
            demo_data = []
            if demo.get('age'):
                demo_data.append(['Age', demo['age']])
            if demo.get('location'):
                demo_data.append(['Location', demo['location']])
            if demo.get('education'):
                demo_data.append(['Education', demo['education']])
            if demo.get('industry'):
                demo_data.append(['Industry', demo['industry']])
            
            if demo_data:
                table = Table(demo_data, colWidths=[1.5*inch, 4*inch])
                table.setStyle(TableStyle([
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('TEXTCOLOR', (0, 0), (0, -1), HexColor('#666666')),
                    ('TEXTCOLOR', (1, 0), (1, -1), HexColor('#333333')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(table)
        
        # Scenario Context
        if persona.get('scenario_context'):
            story.append(Paragraph("Scenario Context", subheading_style))
            story.append(Paragraph(persona['scenario_context'], body_style))
        
        # Goals
        if persona.get('goals'):
            story.append(Paragraph("Goals", subheading_style))
            for goal in persona['goals']:
                story.append(Paragraph(f"• {goal}", body_style))
        
        # Frustrations
        if persona.get('frustrations'):
            story.append(Paragraph("Frustrations", subheading_style))
            for frust in persona['frustrations']:
                story.append(Paragraph(f"• {frust}", body_style))
        
        # Behavioral Patterns
        if persona.get('behavioral_patterns'):
            story.append(Paragraph("Behavioral Patterns", subheading_style))
            for pattern in persona['behavioral_patterns']:
                story.append(Paragraph(f"• {pattern}", body_style))
        
        # Influence Networks
        if persona.get('influence_networks'):
            story.append(Paragraph("Influence Networks", subheading_style))
            for network in persona['influence_networks']:
                story.append(Paragraph(f"• {network}", body_style))
        
        # Recruitment Criteria
        if persona.get('recruitment_criteria'):
            story.append(Paragraph("Recruitment Criteria", subheading_style))
            for criteria in persona['recruitment_criteria']:
                story.append(Paragraph(f"• {criteria}", body_style))
        
        # Research Assumptions
        if persona.get('research_assumptions'):
            story.append(Paragraph("Research Assumptions", subheading_style))
            for assumption in persona['research_assumptions']:
                story.append(Paragraph(f"• {assumption}", body_style))
        
        # Separator line between personas
        if i < len(personas_data) - 1:
            story.append(Spacer(1, 15))
            story.append(Paragraph("─" * 60, body_style))
    
    def add_page_footer(canvas, doc):
        """Add footer with branding and page number to each page."""
        canvas.saveState()
        page_width, page_height = A4
        
        # Footer line
        canvas.setStrokeColor(HexColor('#e0e0e0'))
        canvas.setLineWidth(0.5)
        canvas.line(0.75*inch, 0.6*inch, page_width - 0.75*inch, 0.6*inch)
        
        # Branding text (left side)
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(HexColor('#888888'))
        canvas.drawString(0.75*inch, 0.4*inch, "Generated by PersonaForge")
        
        # Page number (right side)
        page_num = canvas.getPageNumber()
        canvas.drawRightString(page_width - 0.75*inch, 0.4*inch, f"Page {page_num}")
        
        canvas.restoreState()
    
    doc.build(story, onFirstPage=add_page_footer, onLaterPages=add_page_footer)
    buffer.seek(0)
    return buffer.getvalue()


@router.post("/personas")
async def export_personas(
    data: ExportRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    """Export personas as PDF or JSON."""
    # Check eligibility
    can_export, exports_remaining, next_available = check_export_eligibility(user)
    
    if not can_export:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Export limit reached. Free accounts can export once per month.",
                "next_available": next_available.isoformat() if next_available else None
            }
        )
    
    # Validate format
    if data.format not in ["pdf", "json"]:
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'json'")
    
    # Fetch personas (filtered by user_id for security)
    personas = session.exec(
        select(Persona).where(
            Persona.id.in_(data.persona_ids),
            Persona.user_id == user.id
        )
    ).all()
    
    # Generic error for both missing personas and unauthorized access
    if not personas or len(personas) < len(data.persona_ids):
        raise HTTPException(status_code=404, detail="No personas found")
    
    # Serialize personas
    personas_data = [serialize_persona_for_export(p) for p in personas]
    export_date = datetime.now(timezone.utc)
    
    if data.format == "json":
        # JSON export
        export_content = {
            "export_date": export_date.isoformat(),
            "total_personas": len(personas_data),
            "personas": personas_data
        }
        json_bytes = json.dumps(export_content, indent=2).encode('utf-8')
        
        # Update user's last export timestamp ONLY after successful generation
        user.last_export_at = export_date
        session.add(user)
        session.commit()
        
        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=personas_{export_date.strftime('%Y%m%d_%H%M%S')}.json"
            }
        )
    else:
        # PDF export
        pdf_bytes = generate_pdf(personas_data, export_date)
        
        # Update user's last export timestamp ONLY after successful generation
        user.last_export_at = export_date
        session.add(user)
        session.commit()
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=personas_{export_date.strftime('%Y%m%d_%H%M%S')}.pdf"
            }
        )