import os
import json
import httpx
import uuid
import traceback
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
import urllib.parse

from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

# Carregar ambiente
load_dotenv()

# Configurações Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

class SupabaseLite:
    def __init__(self, url, key):
        self.url = f"{url.rstrip('/')}/rest/v1"
        self.storage_url = f"{url.rstrip('/')}/storage/v1/object"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    # DB Operations
    async def db_list_documents(self):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{self.url}/documents?select=*", headers=self.headers)
                return res.json() if res.status_code == 200 else []
        except: return []

    async def db_delete_document(self, name):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.delete(f"{self.url}/documents?name=eq.{urllib.parse.quote(name)}", headers=self.headers)
                return res.status_code in [200, 204]
        except: return False

    # Stats Operations (Exclusive Cloud)
    async def get_stats(self, prompt_id):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{self.url}/prompt_statistics?prompt_id=eq.{urllib.parse.quote(prompt_id)}", headers=self.headers)
                data = res.json()
                return data[0] if data else None
        except: return None

    async def increment_stat(self, prompt_id, stat_type, prompt_text=None):
        try:
            current = await self.get_stats(prompt_id)
            async with httpx.AsyncClient() as client:
                if not current:
                    payload = {
                        "prompt_id": prompt_id,
                        "prompt_text": prompt_text,
                        "views": 1 if stat_type == "views" else 0,
                        "copies": 1 if stat_type == "copies" else 0,
                        "shares": 1 if stat_type == "shares" else 0,
                        "last_interaction": "now()"
                    }
                    res = await client.post(f"{self.url}/prompt_statistics", headers=self.headers, json=payload)
                else:
                    new_val = current.get(stat_type, 0) + 1
                    payload = {stat_type: new_val, "last_interaction": "now()"}
                    if prompt_text: payload["prompt_text"] = prompt_text
                    res = await client.patch(f"{self.url}/prompt_statistics?prompt_id=eq.{urllib.parse.quote(prompt_id)}", headers=self.headers, json=payload)
                return await self.get_stats(prompt_id)
        except Exception as e:
            print(f"Erro increment_stat: {e}")
            return None

    async def get_trending(self, limit=5):
        try:
            async with httpx.AsyncClient() as client:
                # Ordena por visualizações descendente e traz os mais recentes
                res = await client.get(f"{self.url}/prompt_statistics?order=views.desc,last_interaction.desc&limit={limit}", headers=self.headers)
                return res.json() if res.status_code == 200 else []
        except: return []

    # Auth Operations
    async def get_otp_status(self, email):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email)}", headers=self.headers)
                data = res.json()
                return data[0] if res.status_code == 200 and data else None
        except: return None

    async def save_otp(self, email, otp, chat_id):
        try:
            current = await self.get_otp_status(email)
            async with httpx.AsyncClient() as client:
                payload = {
                    "email": email, "otp_code": str(otp), "chat_id": int(chat_id),
                    "is_verified": False, "expires_at": "now() + interval '10 minutes'"
                }
                if current:
                    res = await client.patch(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email)}", headers=self.headers, json=payload)
                else:
                    res = await client.post(f"{self.url}/telegr_auth", headers=self.headers, json=payload)
                return res.status_code in [200, 201, 204]
        except: return False

    async def verify_otp(self, email, otp):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email)}&otp_code=eq.{otp}", headers=self.headers)
                data = res.json()
                if data:
                    await client.patch(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email)}", headers=self.headers, json={"is_verified": True})
                    return True
                return False
        except: return False

# Instância Supabase
sb_lite = SupabaseLite(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_URL and SUPABASE_ANON_KEY else None

app = FastAPI(title="RAG Multimodal API (Vercel)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy Clients for Vercel Cold Starts
_index = None
_client = None

def get_pinecone_index():
    global _index
    if _index is None:
        api_key = os.environ.get("PINECONE_API_KEY")
        if not api_key: return None
        pc = Pinecone(api_key=api_key)
        _index = pc.Index("multimodal-rag")
    return _index

def get_gemini_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key: return None
        _client = genai.Client(api_key=api_key)
    return _client

# Models
class SearchQuery(BaseModel):
    query: str
    top_k: Optional[int] = 5
    model: Optional[str] = None
    gemini_api_key: Optional[str] = None

class StatIncrement(BaseModel):
    prompt_id: str
    text: str
    type: str

class OTPSendRequest(BaseModel):
    email: str
    chat_id: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp_code: str

# Routes
@app.get("/api")
async def root():
    return {"message": "RAG Multimodal Agent API (Vercel Production) is running", "supabase": "connected" if sb_lite else "disconnected"}

@app.get("/api/documents")
async def list_documents():
    if not sb_lite: return []
    return await sb_lite.db_list_documents()

@app.get("/api/stats/trending")
async def get_trending_stats():
    if not sb_lite: return []
    return await sb_lite.get_trending()

@app.get("/api/stats/{prompt_id}")
async def get_prompt_stats(prompt_id: str):
    if not sb_lite: return {"views": 0, "copies": 0, "shares": 0}
    stats = await sb_lite.get_stats(prompt_id)
    return stats if stats else {"views": 0, "copies": 0, "shares": 0}

@app.post("/api/stats/increment")
async def increment_stat(data: StatIncrement):
    if not sb_lite: return None
    return await sb_lite.increment_stat(data.prompt_id, data.type, data.text)

@app.post("/api/auth/otp/send")
async def send_otp(req: OTPSendRequest):
    import random
    otp = random.randint(100000, 999999)
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    
    success = await sb_lite.save_otp(req.email, otp, req.chat_id)
    if not success: raise HTTPException(status_code=500, detail="Error generating security code")

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token: raise HTTPException(status_code=500, detail="Telegram Bot config missing")

    async with httpx.AsyncClient() as client:
        message = f"🔒 *Código de Acesso - Casas Bahia RAG*\n\nSeu código de verificação é: `{otp}`\n\nEste código expira em 10 minutos."
        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        tg_res = await client.post(tg_url, json={"chat_id": req.chat_id, "text": message, "parse_mode": "Markdown"})
        if tg_res.status_code != 200: raise HTTPException(status_code=400, detail="Invalid Telegram ID")

    return {"message": "Code sent successfully!"}

@app.get("/api/auth/otp/status/{email}")
async def get_otp_status_route(email: str):
    if not sb_lite: return {"is_verified": False}
    status = await sb_lite.get_otp_status(email)
    return {"is_verified": status.get("is_verified", False) if status else False}

@app.post("/api/auth/otp/verify")
async def verify_otp_route(req: OTPVerifyRequest):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    success = await sb_lite.verify_otp(req.email, req.otp_code)
    if not success: raise HTTPException(status_code=401, detail="Invalid or expired code")
    return {"verified": True}

# Indexing and Search (Lazy)
@app.post("/api/search")
async def search(search_query: SearchQuery):
    client = get_gemini_client()
    index = get_pinecone_index()
    if not client or not index: raise HTTPException(status_code=503, detail="Engine initialization failed")

    try:
        # Embedding
        formatted_query = f"task: search result | query: {search_query.query}"
        embed_response = client.models.embed_content(model="gemini-embedding-2-preview", contents=formatted_query)
        query_vector = embed_response.embeddings[0].values

        # Retrieval
        results = index.query(vector=query_vector, top_k=search_query.top_k, include_metadata=True)
        
        # Context
        context_text = "\n".join([m.metadata.get("text_content", "") for m in results.matches])
        
        # Generation
        prompt = f"Use o contexto abaixo para responder: {context_text}"
        gen_response = client.models.generate_content(
            model=search_query.model or "gemini-1.5-flash",
            contents=search_query.query,
            config=types.GenerateContentConfig(system_instruction=prompt, temperature=0.3)
        )
        
        return {"answer": gen_response.text, "sources": results.to_dict()["matches"]}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
