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
                # Supabase REST endpoint fix for direct HTTP calls
                rest_url = f"{self.url.replace('/rest/v1', '')}/rest/v1/telegr_auth"
                params = {"email": f"eq.{email.strip()}"}
                res = await client.get(rest_url, headers=self.headers, params=params)
                data = res.json()
                return data[0] if res.status_code == 200 and data else None
        except: return None

    async def save_otp(self, email, otp, chat_id):
        """
        Atomic UPSERT operation for OTP storage.
        Uses PostgREST 'on_conflict' to handle existing email records reliably.
        """
        try:
            async with httpx.AsyncClient() as client:
                email_clean = email.strip()
                try: 
                    clean_id = int(str(chat_id).strip())
                except: 
                    clean_id = 0
                
                payload = {
                    "email": email_clean, 
                    "otp_code": str(otp), 
                    "chat_id": clean_id,
                    "is_verified": False,
                    "expires_at": "now() + interval '10 minutes'"
                }
                
                # Using POST with on_conflict parameter for atomic UPSERT
                # Ensure we point to REST API v1
                url = f"{self.url.replace('/rest/v1', '')}/rest/v1/telegr_auth?on_conflict=email"
                res = await client.post(url, headers=self.headers, json=payload)
                
                if res.status_code not in [200, 201, 204]:
                    print(f"CRITICAL: Supabase SQL Error ({res.status_code}): {res.text}")
                    return False
                return True
        except Exception as e:
            print(f"CRITICAL: System Exception in save_otp: {str(e)}")
            return False

    async def get_user_profile(self, email):
        try:
            async with httpx.AsyncClient() as client:
                email_clean = email.strip()
                rest_url = f"{self.url.replace('/rest/v1', '')}/rest/v1/telegr_auth"
                params = {"email": f"eq.{email_clean}"}
                res = await client.get(rest_url, headers=self.headers, params=params)
                data = res.json()
                return data[0] if res.status_code == 200 and data else None
        except Exception as e:
            print(f"Error fetching user profile: {str(e)}")
            return None

    async def update_user_profile(self, email, data):
        try:
            async with httpx.AsyncClient() as client:
                email_clean = email.strip()
                # Use PATCH with email filter to update specific user
                rest_url = f"{self.url.replace('/rest/v1', '')}/rest/v1/telegr_auth"
                params = {"email": f"eq.{email_clean}"}
                res = await client.patch(rest_url, headers=self.headers, params=params, json=data)
                return res.status_code in [200, 204]
        except Exception as e:
            print(f"Error updating user profile: {str(e)}")
            return False

    async def verify_otp(self, email, otp):
        try:
            async with httpx.AsyncClient() as client:
                email_clean = email.strip()
                rest_url = f"{self.url.replace('/rest/v1', '')}/rest/v1/telegr_auth"
                params = {"email": f"eq.{email_clean}", "otp_code": f"eq.{otp}"}
                res = await client.get(rest_url, headers=self.headers, params=params)
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
                if res.status_code not in [200, 204]:
                    print(f"Erro SQL ao atualizar chat: {res.text}")
                    return False
                return True
        except Exception as e:
            print(f"Erro Exception ao atualizar chat: {e}")
            return False

    async def db_delete_chat(self, chat_id):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.delete(f"{self.url}/chats?id=eq.{chat_id}", headers=self.headers)
                return res.status_code in [200, 204]
        except Exception as e:
            print(f"Erro Exception ao deletar chat: {e}")
            return False

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

class ProfileUpdate(BaseModel):
    email: str
    gemini_api_key: Optional[str] = None
    hide_setup_modal: Optional[bool] = None

class ChatCreateRequest(BaseModel):
    email: str
    title: Optional[str] = "Nova Conversa"

class ChatUpdateRequest(BaseModel):
    messages: List[dict]
    title: Optional[str] = None

# Routes
@app.get("/api")
async def root(email: Optional[str] = None):
    gemini_status = "missing"
    engine_name = "AGENT-RAG-2.5"
    
    if email and sb_lite:
        profile = await sb_lite.get_user_profile(email)
        user_key = profile.get("gemini_api_key") if profile else None
        if user_key:
            try:
                client = get_gemini_client(user_key)
                for _ in client.models.list_models(): break 
                gemini_status = "healthy"
            except Exception as e:
                gemini_status = f"error: {str(e)[:50]}"
        else:
            gemini_status = "key_not_set"
    
    return {
        "message": "Casas Bahia AI Workstation Operational",
        "supabase": "connected" if sb_lite else "disconnected",
        "gemini": gemini_status,
        "engine": engine_name,
        "pinecone": "connected" if get_pinecone_index() else "disconnected"
    }

@app.get("/api/auth/profile/{email}")
async def get_profile(email: str):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    profile = await sb_lite.get_user_profile(email)
    if not profile: raise HTTPException(status_code=404, detail="User not found")
    # Redact API Key for security
    profile_safe = {**profile}
    if profile_safe.get("gemini_api_key"):
        profile_safe["gemini_api_key"] = f"{profile_safe['gemini_api_key'][:8]}...{profile_safe['gemini_api_key'][-4:]}"
        profile_safe["has_key"] = True
    else:
        profile_safe["has_key"] = False
    return profile_safe

@app.post("/api/auth/profile/update")
async def update_profile(req: ProfileUpdate):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    success = await sb_lite.update_user_profile(req.email, {k: v for k, v in req.dict().items() if v is not None and k != "email"})
    if not success: raise HTTPException(status_code=500, detail="Failed to update profile")
    return {"success": True}

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
    if not sb_lite: 
        raise HTTPException(status_code=503, detail="Supabase não configurado localmente.")
    
    success = await sb_lite.save_otp(req.email, otp, req.chat_id)
    if not success: 
        raise HTTPException(status_code=500, detail="Erro ao registrar código no banco de dados.")

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token: 
        raise HTTPException(status_code=503, detail="Token do Telegram ausente no ambiente.")

    async with httpx.AsyncClient() as client:
        message = f"🔒 *Código de Acesso - Casas Bahia RAG*\n\nSeu código é: `{otp}`\n\nEste código expira em 10 minutos."
        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        try:
            tg_res = await client.post(tg_url, json={"chat_id": str(req.chat_id).strip(), "text": message, "parse_mode": "Markdown"})
            if tg_res.status_code != 200: 
                err_data = tg_res.json()
                raise HTTPException(status_code=400, detail=f"Telegram Error: {err_data.get('description', 'Status ' + str(tg_res.status_code))}")
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=502, detail=f"Falha na comunicação com Telegram: {str(e)}")

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
    print(f"--- RAG SEARCH | Query: {search_query.query} | User: {search_query.email}")
    
    # 1. Fetch Key from Supabase Profile
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    profile = await sb_lite.get_user_profile(search_query.email)
    user_key = profile.get("gemini_api_key") if profile else None
    
    if not user_key:
        raise HTTPException(status_code=401, detail="API Key do Gemini não configurada. Por favor, cadastre sua chave no Workstation.")
    
    client = get_gemini_client(user_key)
    index = get_pinecone_index()
    
    if not client:
        raise HTTPException(status_code=503, detail="Gemini Engine não inicializado. Erro na chave do usuário.")
    if not index:
        raise HTTPException(status_code=503, detail="Pinecone Cluster Inativo (Backend).")

    try:
        # Embedding logic remains same (internally uses the provided gemini client)
        formatted_query = f"task: search result | query: {search_query.query}"
        embed_response = None
        
        # Tentamos o modelo mais novo, com fallback para o estável se der 404
        for model_name_emb in ["text-embedding-004", "embedding-001"]:
            try:
                embed_response = client.models.embed_content(model=model_name_emb, contents=formatted_query)
                break
            except Exception as e_emb:
                if "404" in str(e_emb) and model_name_emb != "embedding-001":
                    print(f"--- INFO: Modelo {model_name_emb} indisponível, tentando fallback...")
                    continue
                raise e_emb

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
        
        # Generation com Fallback Dinâmico de Modelo
        # A ordem de prioridade tenta o modelo solicitado, depois flash 2.5 moderno, depois flash 2.5 estável
        model_candidates = [search_query.model, "gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "models/gemini-2.5-flash"]
        gen_response = None
        last_gen_err = None

        for model_name in model_candidates:
            if not model_name: continue
            try:
                gen_response = client.models.generate_content(
                    model=model_name,
                    contents=search_query.query,
                    config=types.GenerateContentConfig(system_instruction=prompt, temperature=0.3)
                )
                if gen_response and gen_response.text:
                    print(f"--- SUCCESS: Generation completed using model: {model_name}")
                    break
            except Exception as e_gen:
                last_gen_err = str(e_gen)
                print(f"--- INFO: Model {model_name} failed. Attempting next candidate. Error: {last_gen_err}")
                continue
        
        if not gen_response:
            raise Exception(f"Todos os modelos Gemini falharam. Último erro: {last_gen_err}")
        
        return {"answer": gen_response.text, "sources": matches}
    except Exception as e:
        traceback.print_exc()
        error_msg = str(e)
        if "404" in error_msg: error_msg = "Modelo ou Recurso não encontrado na API Gemini."
        if "429" in error_msg: error_msg = "Quota excedida no Google Gemini."
        if "invalid" in error_msg.lower(): error_msg = "Parâmetros inválidos na requisição RAG."
        raise HTTPException(status_code=500, detail=error_msg)
