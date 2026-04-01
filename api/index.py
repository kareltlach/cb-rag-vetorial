import os
import json
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Importações ausentes para o RAG
from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

# Carrega variáveis de ambiente do arquivo .env
load_dotenv()

class LocalStatsStore:
    def __init__(self, filename="stats.json"):
        self.filename = filename
        if not os.path.exists(self.filename):
            with open(self.filename, 'w') as f:
                json.dump({}, f)
    
    def get(self, prompt_id):
        try:
            with open(self.filename, 'r') as f:
                data = json.load(f)
            return data.get(prompt_id, {"views": 0, "copies": 0, "shares": 0})
        except:
            return {"views": 0, "copies": 0, "shares": 0}
            
    def increment(self, prompt_id, type):
        try:
            with open(self.filename, 'r') as f:
                data = json.load(f)
            if prompt_id not in data:
                data[prompt_id] = {"views": 0, "copies": 0, "shares": 0}
            data[prompt_id][type] = data[prompt_id].get(type, 0) + 1
            with open(self.filename, 'w') as f:
                json.dump(data, f)
            return data[prompt_id]
        except:
            return {"views": 0, "copies": 0, "shares": 0}

# Configuração Supabase Lite (via httpx)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

class SupabaseLite:
    def __init__(self, url, key):
        self.url = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def get_stats(self, prompt_id):
        if not SUPABASE_URL or not SUPABASE_KEY or SUPABASE_KEY == "SEU_ANON_KEY_AQUI":
            return None
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.url}/prompt_statistics?prompt_id=eq.{prompt_id}"
                response = await client.get(url, headers=self.headers)
                data = response.json()
                return data[0] if data else None
        except Exception as e:
            print(f"Erro Supabase GET: {e}")
            return None

    async def increment_stat(self, prompt_id, stat_type):
        if not SUPABASE_URL or not SUPABASE_KEY or SUPABASE_KEY == "SEU_ANON_KEY_AQUI":
            return False
        try:
            current = await self.get_stats(prompt_id)
            async with httpx.AsyncClient() as client:
                if not current:
                    # Se não existe, cria o registro inicial
                    payload = {
                        "prompt_id": prompt_id,
                        "views": 1 if stat_type == "views" else 0,
                        "copies": 1 if stat_type == "copies" else 0,
                        "shares": 1 if stat_type == "shares" else 0
                    }
                    await client.post(f"{self.url}/prompt_statistics", headers=self.headers, json=payload)
                else:
                    # Se existe, incrementa o valor atual
                    new_val = current.get(stat_type, 0) + 1
                    payload = {stat_type: new_val}
                    url = f"{self.url}/prompt_statistics?prompt_id=eq.{prompt_id}"
                    await client.patch(url, headers=self.headers, json=payload)
                
                return await self.get_stats(prompt_id)
        except Exception as e:
            print(f"Erro Supabase Increment: {e}")
            return None

    async def get_trending(self, limit=5):
        if not SUPABASE_URL or not SUPABASE_KEY or SUPABASE_KEY == "SEU_ANON_KEY_AQUI":
            return []
        try:
            async with httpx.AsyncClient() as client:
                # Ordena por visualizações descendente
                url = f"{self.url}/prompt_statistics?order=views.desc&limit={limit}"
                response = await client.get(url, headers=self.headers)
                return response.json()
        except Exception as e:
            print(f"Erro Supabase Trending: {e}")
            return []

sb_lite = SupabaseLite(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

_local_stats = LocalStatsStore()

app = FastAPI(title="RAG Multimodal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurações do RAG
INDEX_NAME = "multimodal-rag"
EMBEDDING_MODEL = "gemini-embedding-2-preview"
GENERATIVE_MODEL = "gemini-3-flash-preview"

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

# ───────────────────────────────────────────────────────────────────────────────
# Inicialização LAZY — clientes criados apenas na primeira requisição,
# não no cold start (evita FUNCTION_INVOCATION_FAILED)
# ───────────────────────────────────────────────────────────────────────────────
_index = None
_client = None

def get_index():
    global _index
    if _index is None:
        api_key = os.environ.get("PINECONE_API_KEY")
        if not api_key:
            raise RuntimeError("PINECONE_API_KEY não configurada nas variáveis de ambiente do Vercel.")
        pc = Pinecone(api_key=api_key)
        _index = pc.Index(INDEX_NAME)
    return _index

def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY não configurada nas variáveis de ambiente do Vercel.")
        _client = genai.Client(api_key=api_key)
    return _client

# ───────────────────────────────────────────────────────────────────────────────

def is_rate_limit_error(exception):
    return "429" in str(exception) or "RESOURCE_EXHAUSTED" in str(exception)

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception)
)
def safe_embed_content(client, model, contents):
    return client.models.embed_content(model=model, contents=contents)

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=20),
    retry=retry_if_exception_type(Exception)
)
def safe_generate_content(client, model, contents, config):
    return client.models.generate_content(model=model, contents=contents, config=config)


class SearchQuery(BaseModel):
    query: str
    top_k: Optional[int] = 5
    model: Optional[str] = None
    gemini_api_key: Optional[str] = None

class SearchResult(BaseModel):
    id: str
    score: float
    metadata: dict

class ChatResponse(BaseModel):
    answer: str
    sources: List[SearchResult]


@app.get("/api/documents")
async def list_documents():
    """Lista todos os documentos disponíveis para análise na pasta /data no Vercel"""
    docs = []
    # No Vercel, o caminho pode ser relativo à raiz do app
    base_dir = os.path.join(os.getcwd(), "data")
    if not os.path.exists(base_dir):
        # Se falhar, tenta apenas "data"
        base_dir = "data"
        if not os.path.exists(base_dir):
            return []
        
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            ext = file.lower().split('.')[-1]
            if ext in ['pdf', 'png', 'jpg', 'jpeg', 'mp4', 'mov', 'webm']:
                rel_path = os.path.relpath(os.path.join(root, file), base_dir).replace('\\', '/')
                docs.append({
                    "name": file,
                    "type": ext,
                    "path": rel_path
                })
    return docs

@app.get("/api")
async def root():
    return {"message": "RAG Multimodal Agent API is running"}

@app.post("/api/search", response_model=ChatResponse)
async def search(search_query: SearchQuery):
    # Determinar cliente e modelo para esta requisição
    active_model = search_query.model if search_query.model else GENERATIVE_MODEL

    try:
        if search_query.gemini_api_key:
            # Chave customizada do usuário
            active_client = genai.Client(api_key=search_query.gemini_api_key)
        else:
            # Chave padrão do servidor (lazy)
            active_client = get_client()

        active_index = get_index()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao inicializar serviços: {str(e)}")

    try:
        # 1. Embedding da query
        formatted_query = f"task: search result | query: {search_query.query}"
        embed_response = safe_embed_content(
            client=active_client,
            model=EMBEDDING_MODEL,
            contents=formatted_query
        )
        query_vector = embed_response.embeddings[0].values

        # 2. Busca no Pinecone
        results = active_index.query(
            vector=query_vector,
            top_k=search_query.top_k,
            include_metadata=True
        )

        # 3. Consolidar contexto
        context_text = ""
        formatted_results = []
        for match in results.matches:
            text = match.metadata.get("text_content", "")
            context_text += f"\n- {text}\n"
            formatted_results.append(SearchResult(
                id=match.id,
                score=match.score,
                metadata=match.metadata
            ))

        # 4. Gerar resposta com o LLM
        prompt = SYSTEM_PROMPT.format(context=context_text)
        gen_response = safe_generate_content(
            client=active_client,
            model=active_model,
            contents=search_query.query,
            config=types.GenerateContentConfig(
                system_instruction=prompt,
                temperature=0.3
            )
        )

        ai_answer = gen_response.text if gen_response.text else "Não consegui gerar uma resposta agora."

        return ChatResponse(answer=ai_answer, sources=formatted_results)

    except Exception as e:
        error_msg = str(e)
        
        # Se for um erro do Tenacity (RetryError), extraímos a causa real
        if isinstance(e, RetryError):
            try:
                e.last_attempt.result() # Isso vai disparar a exceção original
            except Exception as inner_e:
                error_msg = str(inner_e)

        print(f"ERRO NO BACKEND: {error_msg}")

        if "429" in error_msg or "QUOTA_EXHAUSTED" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            friendly_msg = "A cota do Google Gemini foi atingida para este período (429). Por favor, mude para o modelo 'Gemini 3.1 Flash Lite' nas configurações ou aguarde 1 minuto."
            raise HTTPException(status_code=429, detail=friendly_msg)

        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno: {error_msg}")

@app.get("/api/stats/trending")
async def get_trending_stats():
    if sb_lite:
        data = await sb_lite.get_trending()
        if data: return data
    return []

@app.get("/api/stats/{prompt_id}")
async def get_prompt_stats(prompt_id: str):
    if sb_lite:
        data = await sb_lite.get_stats(prompt_id)
        if data: return data
            
    # Fallback para local
    return _local_stats.get(prompt_id)

class StatIncrement(BaseModel):
    prompt_id: str
    type: str  # 'views', 'copies', 'shares'

@app.post("/api/stats/increment")
async def increment_stat(data: StatIncrement):
    result = None
    if sb_lite:
        result = await sb_lite.increment_stat(data.prompt_id, data.type)

    # Sempre atualiza o local também
    local_result = _local_stats.increment(data.prompt_id, data.type)
    
    return result if result else local_result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
