"""
Filtr. AI Backend — FastAPI + spaCy + Anthropic Claude
Local development server for message & screenshot safety analysis.
Run: uvicorn main:app --reload --port 8000
"""

import os
import re
import json
import base64
import logging
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import spacy
import anthropic
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("filtr-ai")

# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Filtr. AI Backend", version="1.0.0")

# CORS — allow the frontend (Firebase Hosting + local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5000",
        "https://filtr-safe.web.app",
        "https://filtr-safe.firebaseapp.com",
        "https://filtr-336c0.web.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── spaCy NLP Model ─────────────────────────────────────────────────────────
try:
    nlp = spacy.load("en_core_web_sm")
    logger.info("spaCy model 'en_core_web_sm' loaded.")
except OSError:
    logger.warning(
        "spaCy model not found. Run: python -m spacy download en_core_web_sm"
    )
    nlp = None

# ── AI Clients (Anthropic Claude & Google Gemini) ───────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
claude_client = None
if ANTHROPIC_API_KEY:
    try:
        claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        logger.info("Anthropic Claude client initialized.")
    except Exception as e:
        logger.warning(f"Failed to initialize Claude client: {e}")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
gemini_client = None
if GEMINI_API_KEY and genai:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("Google Gemini client initialized.")
    except Exception as e:
        logger.warning(f"Failed to initialize Google Gemini client: {e}")

if not claude_client and not gemini_client:
    logger.info(
        "No AI API key set (ANTHROPIC_API_KEY or GEMINI_API_KEY). "
        "Analysis will use local regex/spaCy and browser OCR fallback."
    )

# ── Safety System Prompt ─────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Filtr., a safety analysis tool for online conversations.
Your job is to detect manipulation, coercion, and scam patterns in messages.

Analyze the provided messages for signs of:
- Romance scam patterns (love-bombing, future-faking, isolation from friends/family)
- Financial manipulation (money requests, crypto, gift cards, "investment" schemes)
- Sextortion signals (intimate image pressure, threats, blackmail, leveraging shame)
- Grooming tactics (secrecy requests, testing boundaries, escalating demands)
- Emotional coercion (guilt-tripping, gaslighting, ultimatums, conditional affection)
- Urgency and pressure (time-limited demands, "today only", "right now")

CRITICAL RULES:
- Warmth, romance, compliments, and long-distance alone are NOT warning signs. Do not flag them.
- Only flag genuine escalation patterns where multiple concerning behaviors combine.
- Be measured and avoid false alarms. A single kind message is not grooming.
- Consider context: early relationship excitement is normal.

Respond ONLY with valid JSON in this exact format:
{
  "concernLevel": "safe" | "watch" | "alert",
  "title": "Short headline (max 10 words)",
  "summary": "2-3 sentence explanation of your findings",
  "signals": ["list", "of", "detected", "patterns"],
  "recommendation": "One specific, actionable safety step"
}

concernLevel guide:
- "safe": No concerning escalation patterns detected
- "watch": One signal worth monitoring (e.g., a single secrecy request)
- "alert": Multiple pressure signals combining (e.g., secrecy + money + urgency)
"""

# ── Regex Fallback Patterns ──────────────────────────────────────────────────
REGEX_PATTERNS = [
    (
        re.compile(
            r"\b(?:money|cash|funds|dollar|dollars|usd|cent|cents|buck|bucks|euro|euros|eur|pound|pounds|gbp|rupee|rupees|inr)\b"
            r"|[\$€£₹]\s*\d+"
            r"|\b(?:wire|transfer|deposit|pay|payment|borrow|lend|loan|owe|reimburse)\b"
            r"|\b(?:send|give|need|lend|wire)\b.{0,30}\b(?:me|us)?\b.{0,20}(?:\d+|cash|money|dollars|bucks|funds|gift\s*card|crypto)"
            r"|\b(?:venmo|zelle|paypal|cash\s*app|apple\s*pay|google\s*pay|western\s*union|moneygram)\b"
            r"|\b(?:bank\s*account|routing\s*number|credit\s*card|debit\s*card)\b"
            r"|\b(?:gift\s*card|apple\s*(?:gift\s*)?card|steam\s*(?:gift\s*)?card|itunes\s*(?:gift\s*)?card|amazon\s*(?:gift\s*)?card|google\s*play|prepaid\s*card)\b"
            r"|\b(?:crypto|cryptocurrency|bitcoin|btc|eth|ethereum|usdt|tether|binance|coinbase|wallet\s*address|invest(?:ment|ing)?|forex)\b",
            re.I,
        ),
        "money request",
    ),
    (
        re.compile(
            r"\b(?:secret|private|don['’]t\s+tell|between\s+us|no\s+one\s+(?:else\s+)?(?:can|should|must|needs\s+to)\s+know|hide\s+(?:this|it)\s+from|delete\s+(?:our\s+)?(?:chat|messages|convo)|disappearing\s+messages)\b",
            re.I,
        ),
        "secrecy request",
    ),
    (
        re.compile(
            r"\b(?:urgent(?:ly)?|right\s+now|immediately|hurry|asap|time\s+(?:is\s+)?running\s*(?:out)?|before\s+it(?:['’]s)?\s+too\s+late|deadline|emergency|at\s+once)\b"
            r"|\b(?:today\s+only|by\s+today|need\s+(?:it\s+)?today|must\s+(?:be\s+)?today|only\s+today)\b",
            re.I,
        ),
        "urgency",
    ),
    (
        re.compile(
            r"\b(?:photo|photos|pic|pics|picture|pictures|nude|nudes|nsfw|selfie|selfies|show\s+me|snap\s+me|video\s*call\s*private|body\s*pic|undress|take\s+(?:it|them)\s+off|send\s+(?:a\s+)?(?:pic|photo|photos|video))\b",
            re.I,
        ),
        "private-image pressure",
    ),
    (
        re.compile(
            r"\b(?:blackmail|expose|ruin\s+you|share\s+(?:this|these|it|them|everything)\s+with|send\s+(?:this|these|it|them)\s+to\s+(?:your|everyone)|screenshot(?:s|ed)?|leak|leaked|post\s+(?:online|them|it)|tell\s+everyone|pay\s+(?:or|me\s+or))\b",
            re.I,
        ),
        "threat/blackmail",
    ),
    (
        re.compile(
            r"\b(?:only\s+love|prove\s+(?:your\s+)?love|prove\s+(?:your\s+)?trust|if\s+you\s+(?:really\s+)?care|don['’]t\s+you\s+love\s+me|you\s+don['’]t\s+trust\s+me|after\s+all\s+i(?:['’]ve)?\s+done|you\s+owe\s+me)\b",
            re.I,
        ),
        "emotional coercion",
    ),
    (
        re.compile(
            r"\b(?:don['’]t\s+tell\s+(?:your\s+)?(?:parents|mom|dad|family|friends|anyone)|they\s+don['’]t\s+understand\s+us|turn\s+(?:them|everyone)\s+against|keep\s+us\s+secret|you\s+only\s+need\s+me)\b",
            re.I,
        ),
        "isolation",
    ),
]


def regex_fallback(text: str, nlp_context: Optional[dict] = None) -> dict:
    """Lightweight local analysis using regex patterns and spaCy NLP context."""
    text_lower = text.lower()
    signals = [label for pattern, label in REGEX_PATTERNS if pattern.search(text_lower)]

    # Leverage spaCy NLP features if available
    if nlp_context:
        for ent in nlp_context.get("entities", []):
            if ent.get("label") == "MONEY" and "money request" not in signals:
                signals.append("money request")
        if nlp_context.get("urgency_score", 0) > 0 and "urgency" not in signals:
            signals.append("urgency")

    is_blackmail = "threat/blackmail" in signals
    concern_level = "alert" if len(signals) > 1 or is_blackmail else ("watch" if len(signals) == 1 else "safe")

    if concern_level == "alert":
        title = "Threat or blackmail signals detected." if is_blackmail else "Pause before replying."
        summary = f"Filtr. noticed {', '.join(signals)}. Multiple concerning signals are combining. Save the messages, verify through a separate channel, and involve someone you trust."
        recommendation = "Do not send money, private images, codes, or IDs. Step back and talk to a trusted adult or friend."
    elif concern_level == "watch":
        title = "A signal worth noticing."
        if "money request" in signals:
            summary = "Filtr. noticed a money or financial request. Financial requests from online connections are a primary warning sign for romance and imposter scams."
            recommendation = "Never send money, wire transfers, crypto, or gift cards to someone you have only met online."
        elif "private-image pressure" in signals:
            summary = "Filtr. noticed pressure for private photos or video. Requests for intimate content can escalate into sextortion or blackmail."
            recommendation = "Do not feel pressured to share intimate photos. You have the right to keep your privacy."
        elif "secrecy request" in signals:
            summary = "Filtr. noticed a secrecy request. Pressure to keep conversations secret is often used to isolate you from support."
            recommendation = "Before agreeing to keep secrets, consider discussing this connection with someone you trust."
        else:
            summary = f"Filtr. noticed {signals[0]}. Keep your boundaries and observe how the conversation develops."
            recommendation = "Stay aware. If more pressure appears, come back and check in again."
    else:
        title = "No combined pressure pattern found yet."
        summary = "Warmth or distance alone is not a warning. Keep your boundaries and review again if a request or pressure appears."
        recommendation = "Enjoy the conversation, and keep sharing only what feels right."

    return {
        "concernLevel": concern_level,
        "title": title,
        "summary": summary,
        "signals": signals,
        "recommendation": recommendation,
        "source": "regex-fallback",
    }


# ── spaCy Pre-processing ────────────────────────────────────────────────────
def spacy_preprocess(text: str) -> dict:
    """Extract contextual features using spaCy NLP."""
    if not nlp:
        return {"entities": [], "urgency_score": 0, "sentence_count": 0}

    doc = nlp(text)

    entities = [
        {"text": ent.text, "label": ent.label_}
        for ent in doc.ents
        if ent.label_ in ("MONEY", "PERSON", "ORG", "GPE", "DATE", "TIME")
    ]

    # Count urgency markers
    urgency_words = {"urgent", "urgently", "immediately", "hurry", "asap", "emergency"}
    urgency_score = sum(1 for token in doc if token.lower_ in urgency_words)

    # Detect imperative sentences (commands)
    imperative_count = sum(
        1 for sent in doc.sents
        if len(sent) > 1 and sent[0].pos_ == "VERB" and sent[0].dep_ == "ROOT"
    )

    return {
        "entities": entities,
        "urgency_score": urgency_score,
        "imperative_count": imperative_count,
        "sentence_count": len(list(doc.sents)),
    }


# ── Gemini AI Analysis ───────────────────────────────────────────────────────
async def gemini_analyze_text(text: str, nlp_context: dict) -> Optional[dict]:
    """Send text to Google Gemini for safety analysis."""
    if not gemini_client:
        return None

    context_note = ""
    if nlp_context.get("entities"):
        entity_strs = [f"{e['text']} ({e['label']})" for e in nlp_context["entities"]]
        context_note += f"\n\nDetected entities: {', '.join(entity_strs)}"
    if nlp_context.get("urgency_score", 0) > 0:
        context_note += f"\nUrgency markers found: {nlp_context['urgency_score']}"

    user_message = f"Analyze these messages for safety concerns:{context_note}\n\n---\n{text}\n---"

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[user_message],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
            ),
        )
        result_text = response.text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(result_text)
        result["source"] = "gemini-ai"
        return result
    except Exception as e:
        logger.error(f"Gemini text analysis error: {e}")
        return None


async def gemini_analyze_image(image_data: bytes, media_type: str) -> Optional[dict]:
    """Send an image to Google Gemini Vision for OCR + safety analysis."""
    if not gemini_client:
        return None

    try:
        part = types.Part.from_bytes(data=image_data, mime_type=media_type)
        user_message = (
            "This is a screenshot of a conversation. "
            "First, read and extract all visible text/messages from the image. "
            "Then analyze the extracted messages for safety concerns according to your instructions. "
            "Respond ONLY with valid JSON in the requested format."
        )

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[part, user_message],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
            ),
        )

        result_text = response.text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(result_text)
        result["source"] = "gemini-vision"
        return result
    except Exception as e:
        logger.error(f"Gemini Vision error: {e}")
        return None


# ── Claude AI Analysis ───────────────────────────────────────────────────────
async def claude_analyze_text(text: str, nlp_context: dict) -> Optional[dict]:
    """Send text to Claude for safety analysis."""
    if not claude_client:
        return None

    context_note = ""
    if nlp_context.get("entities"):
        entity_strs = [f"{e['text']} ({e['label']})" for e in nlp_context["entities"]]
        context_note += f"\n\nDetected entities: {', '.join(entity_strs)}"
    if nlp_context.get("urgency_score", 0) > 0:
        context_note += f"\nUrgency markers found: {nlp_context['urgency_score']}"

    user_message = f"Analyze these messages for safety concerns:{context_note}\n\n---\n{text}\n---"

    try:
        response = claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        result_text = response.content[0].text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(result_text)
        result["source"] = "claude-ai"
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Claude returned invalid JSON: {e}")
        return None
    except anthropic.APIError as e:
        logger.error(f"Claude API error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error calling Claude: {e}")
        return None


async def claude_analyze_image(image_data: bytes, media_type: str) -> Optional[dict]:
    """Send an image to Claude Vision for OCR + safety analysis."""
    if not claude_client:
        return None

    b64_image = base64.standard_b64encode(image_data).decode("utf-8")

    try:
        response = claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "This is a screenshot of a conversation. "
                                "First, read and extract all visible text/messages from the image. "
                                "Then analyze the extracted messages for safety concerns. "
                                "Respond with the JSON format specified in your instructions."
                            ),
                        },
                    ],
                }
            ],
        )

        result_text = response.content[0].text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(result_text)
        result["source"] = "claude-vision"
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Claude Vision returned invalid JSON: {e}")
        return None
    except anthropic.APIError as e:
        logger.error(f"Claude Vision API error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error calling Claude Vision: {e}")
        return None


# ── API Endpoints ────────────────────────────────────────────────────────────

class TextAnalysisRequest(BaseModel):
    text: str


@app.post("/analyze")
async def analyze_text(request: TextAnalysisRequest):
    """Analyze pasted message text for safety concerns."""
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided.")

    # Step 1: spaCy preprocessing
    nlp_context = spacy_preprocess(text)

    # Step 2: Try Gemini AI analysis if configured
    result = None
    if gemini_client:
        result = await gemini_analyze_text(text, nlp_context)

    # Step 3: Try Claude AI analysis if configured and Gemini was not used/failed
    if result is None and claude_client:
        result = await claude_analyze_text(text, nlp_context)

    # Step 4: Fall back to regex + spaCy if no AI LLM is available
    if result is None:
        logger.info("AI LLM unavailable, using regex + spaCy fallback.")
        result = regex_fallback(text, nlp_context)

    result["nlpContext"] = nlp_context
    return result


@app.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    """Analyze an uploaded screenshot for safety concerns."""
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.",
        )

    image_data = await file.read()

    # Size check (max 10MB)
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Max 10MB.")

    # 1. Try Gemini Vision if configured
    result = None
    if gemini_client:
        result = await gemini_analyze_image(image_data, file.content_type)

    # 2. Try Claude Vision if configured
    if result is None and claude_client:
        result = await claude_analyze_image(image_data, file.content_type)

    # 3. If neither AI model is available, indicate OCR fallback
    if result is None:
        result = {
            "concernLevel": "safe",
            "title": "Vision AI key unconfigured.",
            "summary": "No AI vision API key is configured on the backend. Client OCR extraction will read the text and evaluate safety patterns.",
            "signals": [],
            "recommendation": "Configure GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env, or use OCR extraction.",
            "source": "fallback-no-vision",
            "requiresClientOcr": True,
        }

    return result


@app.post("/analyze-images")
async def analyze_multiple_images(files: list[UploadFile] = File(...)):
    """Analyze multiple uploaded screenshots."""
    results = []
    for file in files[:5]:  # Max 5 images
        image_data = await file.read()
        if len(image_data) > 10 * 1024 * 1024:
            results.append({
                "filename": file.filename,
                "error": "Image too large (max 10MB)",
            })
            continue

        result = None
        content_type = file.content_type or "image/jpeg"
        if gemini_client:
            result = await gemini_analyze_image(image_data, content_type)
        if result is None and claude_client:
            result = await claude_analyze_image(image_data, content_type)

        if result:
            result["filename"] = file.filename
        else:
            result = {
                "filename": file.filename,
                "concernLevel": "safe",
                "title": "Vision AI unavailable for this image.",
                "summary": "No AI vision model processed this image.",
                "signals": [],
                "source": "fallback-no-vision",
                "requiresClientOcr": True,
            }
        results.append(result)

    # Aggregate concern level
    levels = [r.get("concernLevel", "safe") for r in results]
    overall = "alert" if "alert" in levels else ("watch" if "watch" in levels else "safe")
    all_signals = []
    for r in results:
        all_signals.extend(r.get("signals", []))

    return {
        "overallConcernLevel": overall,
        "allSignals": list(set(all_signals)),
        "imageResults": results,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "spacy": nlp is not None,
        "claude": claude_client is not None,
        "gemini": gemini_client is not None,
        "visionReady": (claude_client is not None) or (gemini_client is not None),
    }