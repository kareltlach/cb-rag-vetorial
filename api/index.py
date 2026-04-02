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

import urllib.parse
import random
from typing import List, Optional

# Carregar ambiente
load_dotenv()

# Configurações Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

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
                        "shares": 1 if stat_type == "shares" else 0
                    }
                    res = await client.post(f"{self.url}/prompt_statistics", headers=self.headers, json=payload)
                else:
                    new_val = current.get(stat_type, 0) + 1
                    payload = {stat_type: new_val}
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
                try: 
                    clean_id = int(str(chat_id).strip())
                except: 
                    clean_id = 0
                
                payload = {
                    "email": email.strip(), 
                    "otp_code": str(otp), 
                    "chat_id": clean_id,
                    "is_verified": False
                }
                if current:
                    res = await client.patch(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email.strip())}", headers=self.headers, json=payload)
                else:
                    res = await client.post(f"{self.url}/telegr_auth", headers=self.headers, json=payload)
                
                if res.status_code not in [200, 201, 204]:
                    print(f"DEBUG: save_otp error ({res.status_code}): {res.text}")
                    return False
                return True
        except Exception as e:
            print(f"CRITICAL: save_otp exception: {str(e)}")
            return False

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

    # Multi-Chat Operations
    async def db_list_chats(self, email):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"{self.url}/chats?email=eq.{urllib.parse.quote(email)}&order=updated_at.desc", headers=self.headers)
                return res.json() if res.status_code == 200 else []
        except: return []

    async def db_create_chat(self, email, title="Nova Conversa"):
        try:
            async with httpx.AsyncClient() as client:
                headers = {**self.headers, "Prefer": "return=representation"}
                payload = {"email": email, "title": title, "messages": []}
                res = await client.post(f"{self.url}/chats", headers=headers, json=payload)
                if res.status_code != 201 and res.status_code != 200:
                    print(f"Erro SQL ao criar chat: {res.text}")
                    return None
                data = res.json()
                return data[0] if isinstance(data, list) and data else data
        except Exception as e: 
            print(f"Erro Exception ao criar chat: {e}")
            return None

    async def db_update_chat(self, chat_id, messages, title=None):
        try:
            async with httpx.AsyncClient() as client:
                payload = {"messages": messages, "updated_at": "now()"}
                if title: payload["title"] = title
                res = await client.patch(f"{self.url}/chats?id=eq.{chat_id}", headers=self.headers, json=payload)
                return res.status_code in [200, 204]
        except: return False

    async def db_delete_chat(self, chat_id):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.delete(f"{self.url}/chats?id=id.eq.{chat_id}", headers=self.headers) 
                # Note: Corrected eq placement for Supabase ID
                if res.status_code != 204:
                    res = await client.delete(f"{self.url}/chats?id=eq.{chat_id}", headers=self.headers)
                return res.status_code in [200, 204]
        except: return False

# Instância Supabase
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("WARNING: Supabase credentials missing in ENV")
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

def get_gemini_client(api_key=None):
    global _client
    # Se uma chave for passada explicitamente, criamos um novo cliente temporário
    if api_key:
        return genai.Client(api_key=api_key)
    
    if _client is None:
        env_key = os.environ.get("GEMINI_API_KEY")
        if not env_key: return None
        _client = genai.Client(api_key=env_key)
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

class ChatCreateRequest(BaseModel):
    email: str
    title: Optional[str] = "Nova Conversa"

class ChatUpdateRequest(BaseModel):
    messages: List[dict]
    title: Optional[str] = None

# Routes
@app.get("/api")
async def root():
    return {
        "message": "RAG Multimodal Agent API (Vercel Production) is running",
        "supabase": "connected" if sb_lite else "disconnected",
        "env": {
            "GEMINI_KEY": "present" if os.getenv("GEMINI_API_KEY") else "missing",
            "PINECONE_KEY": "present" if os.getenv("PINECONE_API_KEY") else "missing"
        }
    }

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
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase não configurado na Vercel.")
    
    success = await sb_lite.save_otp(req.email, otp, req.chat_id)
    if not success: 
        raise HTTPException(status_code=500, detail="Erro ao registrar código operacional no banco.")

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token: 
        raise HTTPException(status_code=503, detail="Variável TELEGRAM_BOT_TOKEN não encontrada na Vercel.")

    async with httpx.AsyncClient() as client:
        message = f"🔒 *Código de Acesso - Casas Bahia RAG*\n\nSeu código é: `{otp}`\n\nEste código expira em 10 minutos."
        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        tg_res = await client.post(tg_url, json={"chat_id": str(req.chat_id).strip(), "text": message, "parse_mode": "Markdown"})
        if tg_res.status_code != 200: raise HTTPException(status_code=400, detail="Telegram ID inválido ou bot não iniciado.")

    return {"message": "Código enviado com sucesso!"}

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

# Multi-Chat Routes
@app.get("/api/chats/{email}")
async def list_chats(email: str):
    if not sb_lite: return []
    return await sb_lite.db_list_chats(email)

@app.post("/api/chats")
async def create_chat(req: ChatCreateRequest):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    chat = await sb_lite.db_create_chat(req.email, req.title)
    if not chat: raise HTTPException(status_code=500, detail="Error creating chat")
    return chat

@app.patch("/api/chats/{chat_id}")
async def update_chat(chat_id: str, req: ChatUpdateRequest):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    success = await sb_lite.db_update_chat(chat_id, req.messages, req.title)
    if not success: raise HTTPException(status_code=500, detail="Error updating chat")
    return {"success": True}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    success = await sb_lite.db_delete_chat(chat_id)
    if not success: raise HTTPException(status_code=500, detail="Error deleting chat")
    return {"success": True}

# Indexing and Search (Lazy)
@app.post("/api/search")
async def search(search_query: SearchQuery):
    print(f"--- DEBUG: Incoming /api/search | Query: {search_query.query} | Model: {search_query.model}")
    client = get_gemini_client(search_query.gemini_api_key)
    index = get_pinecone_index()
    
    if not client:
        raise HTTPException(status_code=503, detail="Gemini Engine não inicializado. Chave ausente.")
    if not index:
        raise HTTPException(status_code=503, detail="Pinecone Engine não inicializado. Chave ausente.")

    try:
        # Embedding
        formatted_query = f"task: search result | query: {search_query.query}"
        # Usamos text-embedding-004 que é mais estável
        embed_response = client.models.embed_content(model="text-embedding-004", contents=formatted_query)
        query_vector = embed_response.embeddings[0].values

        # Retrieval
        results = index.query(vector=query_vector, top_k=search_query.top_k, include_metadata=True)
        
        # Context
        matches = results.to_dict().get("matches", [])
        context_text = "\n".join([m.get("metadata", {}).get("text_content", "") for m in matches])
        
        if not context_text:
            context_text = "Nenhum documento relevante encontrado na base de conhecimento."

        # Generation
        prompt = f"Use o contexto abaixo para responder: {context_text}"
        
        # Fallback de modelo para gemini-1.5-flash caso o enviado não exista
        model_name = search_query.model if search_query.model and "flash" in search_query.model.lower() else "gemini-1.5-flash"
        if "3" in model_name: model_name = "gemini-1.5-flash" # Proteção contra nomes inexistentes

        gen_response = client.models.generate_content(
            model=model_name,
            contents=search_query.query,
            config=types.GenerateContentConfig(system_instruction=prompt, temperature=0.3)
        )
        
        return {"answer": gen_response.text, "sources": matches}
    except Exception as e:
        import traceback
        full_error = f"{str(e)}\n{traceback.format_exc()}"
        print(f"--- CRITICAL ERROR: {full_error}")
        raise HTTPException(status_code=500, detail=full_error)
