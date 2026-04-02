import os
import json
import httpx
import re
import unicodedata
from typing import List, Optional
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
import shutil
import uuid
import time
from urllib.parse import unquote
from pypdf import PdfReader

# Reusa a lógica de busca do script anterior
from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

# Carrega variáveis de ambiente do arquivo .env
load_dotenv()

# Configuração Supabase Lite (via httpx)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

def sanitize_filename(filename: str) -> str:
    """Conserva apenas caracteres seguros para chaves de storage (Supabase/S3)"""
    import unicodedata
    import re
    # 1. Normaliza unicode e remove acentos
    nksf = unicodedata.normalize('NFKD', filename).encode('ascii', 'ignore').decode('ascii')
    # 2. Remove caracteres especiais (incluindo emojis), exceto alphanumeric, . e _
    # Substitui espaços por underscores
    clean = re.sub(r'[^a-zA-Z0-9._-]', '_', nksf)
    # Remove múltiplos underscores seguidos
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean

class SupabaseLite:
    def __init__(self, url, key):
        self.url = f"{url.rstrip('/')}/rest/v1"
        self.storage_url = f"{url.rstrip('/')}/storage/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def get_user_profile(self, email):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth?email=eq.{email}&select=*"
                res = await client.get(url, headers=self.headers)
                data = res.json()
                return data[0] if data else None
        except: return None

    async def update_user_profile(self, email, data):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth?email=eq.{email}"
                headers = {**self.headers, "Prefer": "return=representation"}
                res = await client.patch(url, headers=headers, json=data)
                return res.status_code in [200, 204]
        except: return False

    async def get_ai_models(self):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/ai_models?is_active=eq.true&select=*&order=created_at.asc"
                res = await client.get(url, headers=self.headers)
                return res.json()
        except: return []

    async def get_user_profile(self, email):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth?email=eq.{email}&select=*"
                res = await client.get(url, headers=self.headers)
                data = res.json()
                return data[0] if data else None
        except: return None

    async def update_user_profile(self, email, data):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth?email=eq.{email}"
                headers = {**self.headers, "Prefer": "return=representation"}
                res = await client.patch(url, headers=headers, json=data)
                return res.status_code in [200, 204]
        except: return False

    async def get_ai_models(self):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/ai_models?is_active=eq.true&select=*&order=created_at.asc"
                res = await client.get(url, headers=self.headers)
                return res.json()
        except: return []

    async def get_stats(self, prompt_id):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return None
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/prompt_statistics"
                params = {"prompt_id": f"eq.{prompt_id}"}
                response = await client.get(url, headers=self.headers, params=params)
                if response.is_error:
                    print(f"Erro Supabase GET STATS ({response.status_code}): {response.text}")
                    return None
                data = response.json()
                return data[0] if data else None
        except Exception as e:
            print(f"Erro Supabase GET: {e}")
            return None

    # --- TELEGRAM AUTH METHODS ---
    async def get_otp_status(self, email):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth"
                params = {"email": f"eq.{email}"}
                response = await client.get(url, headers=self.headers, params=params)
                if response.is_error:
                    print(f"Erro Supabase GET OTP ({response.status_code}): {response.text}")
                    return None
                data = response.json()
                return data[0] if data else None
        except Exception as e:
            print(f"Erro Supabase GET OTP: {e}")
            return None

    async def save_otp(self, email, otp, chat_id):
        try:
            current = await self.get_otp_status(email)
            async with httpx.AsyncClient() as client:
                try: cid = int(chat_id)
                except: cid = 0
                payload = {
                    "email": email, 
                    "otp_code": str(otp), 
                    "chat_id": cid,
                    "is_verified": False
                }
                if current:
                    res = await client.patch(f"{self.url}/telegr_auth?email=eq.{urllib.parse.quote(email)}", headers=self.headers, json=payload)
                else:
                    res = await client.post(f"{self.url}/telegr_auth", headers=self.headers, json=payload)
                return res.status_code in [200, 201, 204]
        except Exception as e:
            print(f"Erro save_otp: {e}")
            return False

    # Multi-Chat Operations
    async def db_list_chats(self, email):
        import urllib.parse
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
                    print(f"Erro SQL local ao criar chat: {res.text}")
                    return None
                data = res.json()
                return data[0] if isinstance(data, list) and data else data
        except Exception as e: 
            print(f"Erro Exception local ao criar chat: {e}")
            return None

    async def db_update_chat(self, chat_id, messages, title=None):
        try:
            async with httpx.AsyncClient() as client:
                payload = {"messages": messages}
                if title: payload["title"] = title
                res = await client.patch(f"{self.url}/chats?id=eq.{chat_id}", headers=self.headers, json=payload)
                return res.status_code in [200, 204]
        except: return False

    async def db_delete_chat(self, chat_id):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.delete(f"{self.url}/chats?id=eq.{chat_id}", headers=self.headers)
                return res.status_code in [200, 204]
        except: return False

    async def verify_otp(self, email, otp):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/telegr_auth"
                params = {"email": f"eq.{email}", "otp_code": f"eq.{otp}"}
                response = await client.get(url, headers=self.headers, params=params)
                data = response.json()
                if data:
                    patch_url = f"{self.url}/telegr_auth"
                    patch_params = {"email": f"eq.{email}"}
                    res = await client.patch(patch_url, headers=self.headers, params=patch_params, json={"is_verified": True})
                    return not res.is_error
                return False
        except Exception as e:
            print(f"Erro Supabase VERIFY OTP: {e}")
            return False
    # -----------------------------

    async def increment_stat(self, prompt_id, stat_type, prompt_text=None):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return None
        try:
            current = await self.get_stats(prompt_id)
            async with httpx.AsyncClient() as client:
                if not current:
                    payload = {
                        "prompt_id": prompt_id,
                        "prompt_text": prompt_text if prompt_text else prompt_id,
                        "views": 1 if stat_type == "views" else 0,
                        "copies": 1 if stat_type == "copies" else 0,
                        "shares": 1 if stat_type == "shares" else 0
                    }
                    await client.post(f"{self.url}/prompt_statistics", headers=self.headers, json=payload)
                else:
                    new_val = current.get(stat_type, 0) + 1
                    payload = {stat_type: new_val}
                    if prompt_text:
                        payload["prompt_text"] = prompt_text
                    elif not current.get("prompt_text"):
                        payload["prompt_text"] = prompt_id
                    
                    url = f"{self.url}/prompt_statistics"
                    params = {"prompt_id": f"eq.{prompt_id}"}
                    await client.patch(url, headers=self.headers, params=params, json=payload)
                
                return await self.get_stats(prompt_id)
        except Exception as e:
            print(f"Erro Supabase Increment: {e}")
            return None

    async def get_trending(self, limit=5):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return []
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/prompt_statistics"
                params = {
                    "or": "(views.gt.0,copies.gt.0,shares.gt.0)",
                    "order": "views.desc",
                    "limit": limit
                }
                response = await client.get(url, headers=self.headers, params=params)
                if response.is_error:
                    print(f"Erro Supabase TRENDING ({response.status_code}): {response.text}")
                    return []
                return response.json()
        except Exception as e:
            print(f"Erro Supabase Trending: {e}")
            return []

    # --- DOCUMENT MANAGEMENT METHODS ---
    async def db_list_documents(self):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/documents"
                params = {"order": "created_at.desc"}
                response = await client.get(url, headers=self.headers, params=params)
                if response.is_error:
                    print(f"Erro Supabase LIST DOCS ({response.status_code}): {response.text}")
                    return []
                return response.json()
        except Exception as e:
            print(f"Erro Supabase LIST DOCUMENTS: {e}")
            return []

    async def db_register_document(self, name, type, supabase_url):
        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    "name": name,
                    "type": type,
                    "supabase_url": supabase_url,
                    "pinecone_indexed": False
                }
                res = await client.post(f"{self.url}/documents", headers=self.headers, json=payload)
                if res.is_error:
                    print(f"Erro Supabase DB REGISTER ({res.status_code}): {res.text}")
                    return False
                return True
        except Exception as e:
            print(f"Erro Supabase REGISTER DOCUMENT: {e}")
            return False

    async def db_mark_as_indexed(self, name):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/documents"
                params = {"name": f"eq.{name}"}
                res = await client.patch(url, headers=self.headers, params=params, json={"pinecone_indexed": True})
                return not res.is_error
        except Exception as e:
            print(f"Erro Supabase MARK AS INDEXED: {e}")
            return False

    async def db_delete_document(self, name):
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/documents"
                params = {"name": f"eq.{name}"}
                print(f"DEBUG: Tentando deletar do DB: {url} com params {params}")
                res = await client.delete(url, headers=self.headers, params=params)
                if res.is_error:
                    print(f"ERRO Supabase DB DELETE ({res.status_code}): {res.text}")
                    return False
                print(f"SUCESSO: Registro {name} removido do banco.")
                return True
        except Exception as e:
            print(f"Erro Supabase DELETE DOCUMENT DB Exception: {e}")
            return False

    # --- STORAGE HELPERS (via httpx to Supabase Storage API) ---
    async def storage_upload(self, bucket, path, file_content, content_type):
        from urllib.parse import quote
        try:
            safe_path = quote(path)
            storage_url = f"{self.storage_url}/object/{bucket}/{safe_path}"
            upload_headers = self.headers.copy()
            upload_headers["Content-Type"] = content_type
            async with httpx.AsyncClient() as client:
                res = await client.post(storage_url, headers=upload_headers, content=file_content)
                if res.status_code in [200, 201]:
                    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{safe_path}"
                err_msg = f"HTTP {res.status_code}: {res.text}"
                print(f"Erro Storage Upload: {err_msg}")
                return {"error": err_msg}
        except Exception as e:
            err_msg = str(e)
            print(f"Erro Storage Upload Exception: {err_msg}")
            return {"error": err_msg}

    async def storage_delete(self, bucket, path):
        from urllib.parse import quote
        try:
            safe_path = quote(path)
            storage_url = f"{self.storage_url}/object/{bucket}/{safe_path}"
            print(f"DEBUG: Tentando deletar do Storage: {storage_url}")
            async with httpx.AsyncClient() as client:
                res = await client.delete(storage_url, headers=self.headers)
                if res.status_code in [200, 204]:
                    print(f"SUCESSO: Arquivo {path} removido do storage.")
                    return True
                print(f"ERRO Supabase Storage DELETE ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            print(f"Erro Storage DELETE Exception: {e}")
            return False

# --- Ingestão / Helper Functions ---
def sanitize_vector_id(name: str):
    """Garante que o ID seja ASCII e sem caracteres especiais para o Pinecone."""
    # Remove emojis e normaliza para ASCII (ex: 'á' -> 'a')
    nfkd_form = unicodedata.normalize('NFKD', name)
    only_ascii = nfkd_form.encode('ASCII', 'ignore').decode('ASCII')
    # Substitui espaços e caracteres não-alfanuméricos por underscores
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', only_ascii)
    # Remove underscores duplicados ou no início/fim
    return re.sub(r'_+', '_', clean).strip('_')

def extract_text_chunks_from_pdf(pdf_path, chunk_size=1200, overlap=150):
    text_chunks = []
    try:
        reader = PdfReader(pdf_path)
        full_text = ""
        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                full_text += f"\n[Página {page_num + 1}]\n" + page_text
        
        start = 0
        while start < len(full_text):
            end = start + chunk_size
            chunk = full_text[start:end]
            text_chunks.append(chunk)
            start += (chunk_size - overlap)
    except Exception as e:
        print(f"Erro ao ler PDF {pdf_path}: {e}")
    return text_chunks

async def upload_to_gemini(file_path: str):
    print(f"Fazendo upload do arquivo para Gemini: {file_path}")
    file = client.files.upload(file=file_path)
    while file.state.name == 'PROCESSING':
        time.sleep(2)
        file = client.files.get(name=file.name)
    if file.state.name == 'FAILED':
        raise ValueError(f"Falha ao processar o arquivo no Gemini {file.name}")
    return file

async def process_and_index_file_internal(file_source: str, mod_type: str, file_name: str):
    if not index: return
    
    # file_source agora é a URL do Supabase Storage
    # Para PDFs, precisamos fazer o download temporário para ler com PdfReader
    local_tmp_path = None
    if mod_type == "document" and file_name.lower().endswith(".pdf"):
        try:
            local_tmp_path = os.path.join("tmp", file_name)
            if not os.path.exists("tmp"): os.makedirs("tmp")
            async with httpx.AsyncClient() as client_http:
                resp = await client_http.get(file_source)
                with open(local_tmp_path, "wb") as f:
                    f.write(resp.content)
            
            chunks = extract_text_chunks_from_pdf(local_tmp_path)
            for i, chunk_text in enumerate(chunks):
                formatted_text = f"task: search result | content: {chunk_text}"
                res = client.models.embed_content(model=EMBEDDING_MODEL, contents=formatted_text)
                vector = res.embeddings[0].values
                sanitized_name = sanitize_vector_id(file_name)
                cid = f"{sanitized_name}_ch_{i}_{str(uuid.uuid4())[:8]}"
                
                metadata = {
                    "source": file_source, # URL Supabase
                    "name": file_name,
                    "type": "pdf_chunk",
                    "text_content": chunk_text,
                    "chunk_index": i
                }
                index.upsert(vectors=[{"id": cid, "values": vector, "metadata": metadata}])
        except Exception as e:
            print(f"Erro processamento PDF: {e}")
        finally:
            if local_tmp_path and os.path.exists(local_tmp_path):
                os.remove(local_tmp_path)
        return

    # Multimodal (Imagem, Vídeo) - Gemini pode processar via URL diretamente em alguns contextos,
    # mas aqui usamos o upload_to_gemini que espera um path local.
    # Vamos baixar temporariamente.
    try:
        local_tmp_path = os.path.join("tmp", file_name)
        if not os.path.exists("tmp"): os.makedirs("tmp")
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.get(file_source)
            with open(local_tmp_path, "wb") as f:
                f.write(resp.content)

        sanitized_filename = sanitize_vector_id(file_name)
        fid = f"mm_{sanitized_filename}_{str(uuid.uuid4())[:8]}"
        metadata = {"source": file_source, "name": file_name, "type": mod_type}
        
        uploaded_file = await upload_to_gemini(local_tmp_path)
        res = client.models.embed_content(model=EMBEDDING_MODEL, contents=uploaded_file)
        vector = res.embeddings[0].values
        metadata["gemini_file_uri"] = uploaded_file.uri
        metadata["text_content"] = f"Conteúdo Multimodal: {file_name}"
        index.upsert(vectors=[{"id": fid, "values": vector, "metadata": metadata}])
    except Exception as e:
        print(f"Erro indexação multimodal: {e}")
    finally:
        if local_tmp_path and os.path.exists(local_tmp_path):
            os.remove(local_tmp_path)

sb_lite = SupabaseLite(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_URL and SUPABASE_ANON_KEY else None

app = FastAPI(title="RAG Multimodal API")

# Habilitar CORS para o frontend (Vite porta padrão 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Para desenvolvimento, permite tudo. Ajuste em produção.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurações do RAG
INDEX_NAME = "multimodal-rag"
EMBEDDING_MODEL = "gemini-embedding-2-preview"
GENERATIVE_MODEL = "gemini-3-flash-preview" # Modelo padrão de última geração

# Prompt do Sistema (IA Agente Tutorial)
SYSTEM_PROMPT = """
Você é um especialista em Design e Experiência do Usuário (UX). 
Sua missão é atuar como um Agente Tutor amigável que responde em Português do Brasil.

INSTRUÇÕES:
1. Use os 'TRECHOS DE DOCUMENTOS' fornecidos abaixo para responder à pergunta do usuário.
2. Formate sua resposta como um **passo a passo ou tutorial curto** sempre que possível.
3. Se a informação não estiver presente nos documentos, diga gentilmente que não encontrou esse detalhe específico no material indexado.
4. Mantenha um tom profissional, mas acessível.
5. SEMPRE que você apresentar um 'Prompt' (instrução para IA) extraído dos documentos, você DEVE envolvê-lo em blocos de código usando três crases (```) para que o sistema o exiba no editor de código. Nunca use aspas comuns ou citações (>) para o texto do prompt em si.

---
TRECHOS DE DOCUMENTOS:
{context}
---
"""

# Inicializar Clientes de forma robusta
def get_pinecone_index():
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        print("ALERTA: PINECONE_API_KEY não configurada!")
        return None
    try:
        pc = Pinecone(api_key=api_key)
        return pc.Index(INDEX_NAME)
    except Exception as e:
        print(f"Erro ao inicializar Pinecone: {e}")
        return None

def get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ALERTA: GEMINI_API_KEY não configurada!")
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        print(f"Erro ao inicializar Gemini: {e}")
        return None

index = get_pinecone_index()
client = get_gemini_client()

#retry decorator para lidar com limites de cota (429)
def is_rate_limit_error(exception):
    # O SDK google-genai pode retornar erros de diferentes formas. 
    # Frequentemente como uma exceção genérica com a mensagem 429.
    return "429" in str(exception) or "RESOURCE_EXHAUSTED" in str(exception)

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception) # Simplificado para capturar o que o SDK joga
)
def safe_embed_content(client, model, contents):
    try:
        return client.models.embed_content(model=model, contents=contents)
    except Exception as e:
        if is_rate_limit_error(e):
            print(f"Limite de cota atingido na incorporação. Tentando novamente...")
            raise e
        raise e

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=20),
    retry=retry_if_exception_type(Exception)
)
def safe_generate_content(client, model, contents, config):
    try:
        return client.models.generate_content(model=model, contents=contents, config=config)
    except Exception as e:
        if is_rate_limit_error(e):
            print(f"Limite de cota atingido na geração. Tentando novamente...")
            raise e
        raise e

# Servir a pasta de dados para que o frontend possa exibir as imagens e vídeos locais
if os.path.exists("data"):
  app.mount("/media", StaticFiles(directory="data"), name="media")

class SearchQuery(BaseModel):
    query: str
    top_k: Optional[int] = 5
    model: Optional[str] = None
    gemini_api_key: Optional[str] = None
    email: Optional[str] = None

class SearchResult(BaseModel):
    id: str
    score: float
    metadata: dict

class ChatResponse(BaseModel):
    answer: str
    sources: List[SearchResult]

class StatIncrement(BaseModel):
    prompt_id: str
    text: str
    type: str  # 'views', 'copies', 'shares'

class OTPSendRequest(BaseModel):
    email: str
    chat_id: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp_code: str

class ChatCreateRequest(BaseModel):
    email: str
    title: str

class ChatUpdateRequest(BaseModel):
    messages: list
    title: Optional[str] = None

@app.get("/api/documents")
async def list_documents():
    """Lista todos os documentos disponíveis indexados no Supabase"""
    if not sb_lite: return []
    return await sb_lite.db_list_documents()

@app.delete("/api/documents/{filename:path}")
async def delete_document(filename: str):
    """Remove um documento do Supabase Storage, DB e seus vetores no Pinecone"""
    import traceback
    from urllib.parse import unquote
    
    # Decodifica o nome (FastAPI já decodifica, unquote garante compatibilidade com camadas extras)
    file_name = unquote(filename)
    
    if not sb_lite: 
        raise HTTPException(status_code=503, detail="Supabase não inicializado.")

    print(f"DEBUG: Iniciando expurgação atômica de: {file_name}")

    try:
        # 1. Buscar metadados para ter a URL original (necessária para o Pinecone)
        docs = await sb_lite.db_list_documents() or []
        doc_meta = next((d for d in docs if d["name"] == file_name), None)
        
        # Se não achou pelo nome original, tentamos uma busca flexível se necessário, 
        # mas aqui focamos na consistência do nome enviado.
        if not doc_meta:
            raise HTTPException(status_code=404, detail=f"Documento '{file_name}' não encontrado no registro central.")

        supabase_url = doc_meta.get("supabase_url")
        
        # 2. Remover do Pinecone (Operação Crítica)
        if index and supabase_url:
            try:
                # O filtro por metadado 'source' é a forma mais eficaz de remover todos os chunks
                index.delete(filter={"source": {"$eq": supabase_url}})
                print(f"SUCESSO [Pinecone]: Vetores de {file_name} removidos.")
            except Exception as pine_err:
                print(f"ALERTA [Pinecone]: Falha ao remover vetores: {pine_err}")
                # Continuamos a limpeza mesmo se o Pinecone falhar (ex: plano Starter sem filtro)

        # 3. Remover do Supabase Storage
        try:
            # Extrair o nome real do arquivo (storage key) da URL para remoção
            # Ex: https://.../public/rag-documents/Playbook_Test.pdf -> Playbook_Test.pdf
            storage_key = supabase_url.split('/')[-1]
            from urllib.parse import unquote
            storage_path = unquote(storage_key)
            
            storage_success = await sb_lite.storage_delete("rag-documents", storage_path)
        except Exception as storage_err:
            print(f"ALERTA [Storage]: Falha ao remover arquivo: {storage_err}")
            storage_success = False

        # 4. Remover do Supabase Database (Limpa o estado na UI)
        db_success = await sb_lite.db_delete_document(file_name)

        if not db_success and not storage_success:
            raise HTTPException(status_code=500, detail="Falha em remover tanto do Storage quanto do Banco.")

        return {
            "status": "success", 
            "message": f"Fonte '{file_name}' expurgada com sucesso.",
            "details": {
                "pinecone": "attempted",
                "storage": "success" if storage_success else "failed",
                "database": "success" if db_success else "failed"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"FALHA CRÍTICA na operação de delete para {filename}:")
        print(error_trace)
        raise HTTPException(
            status_code=500, 
            detail=f"Erro interno ao expurgar documento: {str(e)}"
        )

@app.get("/api")
async def root(email: Optional[str] = None):
    gemini_status = "missing"
    engine_name = "AGENT-RAG-2.5"
    
    if email and sb_lite:
        profile = await sb_lite.get_user_profile(email)
        user_key = profile.get("gemini_api_key") if profile else None
        if user_key:
            try:
                temp_client = genai.Client(api_key=user_key)
                for _ in temp_client.models.list_models(): break 
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
    return profile

@app.patch("/api/auth/profile/{email}")
async def update_profile_endpoint(email: str, data: dict):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    # Removendo 'email' dos dados se enviado no body (usamos o da URL)
    data.pop('email', None)
    success = await sb_lite.update_user_profile(email, data)
    if not success: raise HTTPException(status_code=500, detail="Falha ao atualizar perfil")
    return {"success": True}

@app.get("/api/ai/models")
async def list_ai_models():
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    models = await sb_lite.get_ai_models()
    return models


@app.post("/api/search", response_model=ChatResponse)
async def search(search_query: SearchQuery):
    # CLIENTE: Prioridade para a chave enviada na query (configurações do usuário)
    # Se não houver, tenta usar a variável de ambiente global (fallback admin)
    active_client = None
    user_key = search_query.gemini_api_key
    
    if user_key:
        try:
            active_client = genai.Client(api_key=user_key)
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Chave Gemini Inválida: {str(e)}")
    else:
        active_client = client # Fallback para a chave do .env se existir

    if not active_client:
        raise HTTPException(status_code=403, detail="Gemini API Key não configurada. Por favor, adicione sua chave nas configurações.")

    # MODELO: Prioridade para o modelo salvo no perfil do usuário
    active_model = search_query.model if search_query.model else GENERATIVE_MODEL

    if not index:
        raise HTTPException(status_code=503, detail="Serviço de Busca Vetorial (Pinecone) indisponível.")

    try:
        # 1. Gerar vetor da query
        formatted_query = f"task: search result | query: {search_query.query}"
        
        embed_response = safe_embed_content(
            client=active_client,
            model=EMBEDDING_MODEL,
            contents=formatted_query
        )
        query_vector = embed_response.embeddings[0].values
        
        # 2. Consultar Pinecone
        results = index.query(
            vector=query_vector,
            top_k=search_query.top_k,
            include_metadata=True
        )
        
        # 3. Consolidar contexto
        context_text = ""
        formatted_results = []
        for match in results.matches:
            msg = match.metadata.get("text_content", "")
            context_text += f"\n- {msg}\n"
            
            metadata = match.metadata
            if "source" in metadata:
                source_url = metadata["source"]
                metadata["media_url"] = source_url # URL direta do Supabase Storage
                
            formatted_results.append(SearchResult(
                id=match.id,
                score=match.score,
                metadata=metadata
            ))
        
        # 4. Geração da Resposta com Fallback de Modelo (em caso de cota/erro)
        # Tenta o modelo ativo, depois flash lite como seguro
        model_candidates = [active_model, "gemini-2.5-flash", "gemini-1.5-flash"]
        gen_response = None
        last_err = None
        
        for candidate in model_candidates:
            if not candidate: continue
            try:
                prompt = SYSTEM_PROMPT.format(context=context_text)
                gen_response = safe_generate_content(
                    client=active_client,
                    model=candidate,
                    contents=search_query.query,
                    config=types.GenerateContentConfig(system_instruction=prompt, temperature=0.3)
                )
                if gen_response: break
            except Exception as candidate_err:
                last_err = str(candidate_err)
                continue

        if not gen_response:
            raise Exception(f"Erro ao gerar resposta com Gemini: {last_err}")
            
        return ChatResponse(
            answer=gen_response.text if gen_response.text else "Sem resposta.",
            sources=formatted_results
        )
    except Exception as e:
        error_msg = str(e)
        
        # Se for um erro do Tenacity (RetryError), extraímos a causa real
        if isinstance(e, RetryError):
            try:
                e.last_attempt.result() # Isso vai disparar a exceção original
            except Exception as inner_e:
                error_msg = str(inner_e)

        print(f"ERRO CRÍTICO NO BACKEND: {error_msg}")
        
        if "429" in error_msg or "QUOTA_EXHAUSTED" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            friendly_msg = "A cota do Google Gemini foi atingida para este período (429). Por favor, aguarde cerca de 1 minuto ou mude para o modelo 'Gemini 3.1 Flash Lite' nas configurações."
            raise HTTPException(status_code=429, detail=friendly_msg)
            
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno: {error_msg}")

@app.get("/api/stats/trending")
async def get_trending_stats():
    # Usa exclusivamente o Supabase para tendências em tempo real
    if not sb_lite:
        raise HTTPException(status_code=503, detail="Serviço de estatísticas (Supabase) não configurado.")
        
    try:
        data = await sb_lite.get_trending()
        return data or []
    except Exception as e:
        print(f"Erro ao buscar tendências: {e}")
        return []

@app.get("/api/stats/{prompt_id}")
async def get_prompt_stats(prompt_id: str):
    if sb_lite:
        data = await sb_lite.get_stats(prompt_id)
        if data: return data
            
    return {"views": 0, "copies": 0, "shares": 0}

@app.post("/api/stats/increment")
async def increment_stat(data: StatIncrement):
    if not sb_lite:
        raise HTTPException(status_code=503, detail="Serviço de estatísticas não disponível.")
        
    result = await sb_lite.increment_stat(data.prompt_id, data.type, data.text)
    if not result:
        raise HTTPException(status_code=500, detail="Falha ao incrementar estatística no banco de dados.")
        
    return result

# ───────────────────────────────────────────────────────────────────────────────
# Rotas de Autenticação Telegram (OTP)
# ───────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/otp/send")
async def send_otp(req: OTPSendRequest):
    import random
    otp = random.randint(100000, 999999)
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase not connected")
    
    success = await sb_lite.save_otp(req.email, otp, req.chat_id)
    if not success: raise HTTPException(status_code=500, detail="Falha ao registrar código de segurança. Verifique a tabela 'telegr_auth'.")

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token: raise HTTPException(status_code=500, detail="Telegram Bot token não configurado no .env")

    async with httpx.AsyncClient() as client:
        message = f"🔒 *Código de Proteção - Casas Bahia RAG*\n\nSeu código operacional é: `{otp}`\n\nEste código é válido por 10 minutos."
        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        tg_res = await client.post(tg_url, json={"chat_id": req.chat_id, "text": message, "parse_mode": "Markdown"})
        if tg_res.status_code != 200: 
            print(f"Erro Telegram: {tg_res.text}")
            raise HTTPException(status_code=400, detail="ID de Telegram inválido ou bot não iniciado.")

    return {"message": "Código de segurança enviado via Telegram."}

@app.get("/api/auth/otp/status/{email}")
async def get_otp_status(email: str):
    if not sb_lite: return {"is_verified": False}
    status = await sb_lite.get_otp_status(email)
    return {"is_verified": status.get("is_verified", False) if status else False}

@app.post("/api/auth/otp/verify")
async def verify_otp(req: OTPVerifyRequest):
    success = await sb_lite.verify_otp(req.email, req.otp_code)
    if not success:
        raise HTTPException(status_code=401, detail="Código inválido ou expirado.")
    return {"message": "Verificação concluída!", "verified": True}

@app.post("/api/upload")
async def upload_file_endpoint(file: UploadFile = File(...)):
    if not sb_lite: raise HTTPException(status_code=503, detail="Supabase não inicializado.")

    # 1. Ler conteúdo para memória
    file_content = await file.read()
    
    # 2. Sanitização (Estratégia Dual-Filename)
    # Original: "📘 Playbook.pdf" -> UI
    # Sanitizado: "Playbook.pdf" -> Storage/Pinecone
    original_filename = file.filename
    sanitized_name = sanitize_filename(original_filename)
    
    # Se a sanitização removeu tudo, geramos um ID único
    if not sanitized_name or sanitized_name == ".":
        sanitized_name = f"upload_{uuid.uuid4().hex[:8]}"

    # 3. Upload para Supabase Storage usando o nome sanitizado
    upload_result = await sb_lite.storage_upload("rag-documents", sanitized_name, file_content, file.content_type)
    
    if isinstance(upload_result, dict) and "error" in upload_result:
        raise HTTPException(status_code=500, detail=f"Falha Supabase Storage: {upload_result['error']}")
    
    if not upload_result:
        raise HTTPException(status_code=500, detail="Falha ao fazer upload para nuvem Supabase (URL não retornada).")

    supabase_url = upload_result

    # 4. Registrar no Supabase Database (Usando o nome ORIGINAL para a UI)
    ext = original_filename.lower().split('.')[-1]
    mod_type = "document"
    if ext in ['png', 'jpg', 'jpeg']: mod_type = "image"
    elif ext in ['mp4', 'mov', 'webm']: mod_type = "video"
    
    await sb_lite.db_register_document(original_filename, mod_type, supabase_url)

    # 5. Processamento assíncrono para Pinecone (Usando o nome original para log/mark_indexed)
    try:
        await process_and_index_file_internal(supabase_url, mod_type, original_filename)
        await sb_lite.db_mark_as_indexed(original_filename)
        return {"status": "success", "filename": original_filename, "url": supabase_url}
    except Exception as e:
        # Tenta remover do banco se falhar a indexação
        await sb_lite.db_delete_document(original_filename)
        raise HTTPException(status_code=500, detail=f"Erro na indexação vetorial: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
