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
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
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
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return False
        try:
            current = await self.get_stats(prompt_id)
            async with httpx.AsyncClient() as client:
                if not current:
                    payload = {
                        "prompt_id": prompt_id,
                        "views": 1 if stat_type == "views" else 0,
                        "copies": 1 if stat_type == "copies" else 0,
                        "shares": 1 if stat_type == "shares" else 0
                    }
                    await client.post(f"{self.url}/prompt_statistics", headers=self.headers, json=payload)
                    url = f"{self.url}/prompt_statistics?prompt_id=eq.{prompt_id}"
                    response = await client.patch(url, headers=self.headers, json=payload)
                
                # Após o POST ou PATCH bem-sucedido, retorna o estado final
                return await self.get_stats(prompt_id)
        except Exception as e:
            print(f"Erro Supabase Increment: {e}")
            return None

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

async def process_and_index_file_internal(file_path: str, mod_type: str):
    if not index: return
    
    if mod_type == "document" and file_path.lower().endswith(".pdf"):
        chunks = extract_text_chunks_from_pdf(file_path)
        for i, chunk_text in enumerate(chunks):
            formatted_text = f"task: search result | content: {chunk_text}"
            res = client.models.embed_content(model=EMBEDDING_MODEL, contents=formatted_text)
            vector = res.embeddings[0].values
            sanitized_name = sanitize_vector_id(os.path.basename(file_path))
            cid = f"{sanitized_name}_ch_{i}_{str(uuid.uuid4())[:8]}"
            # Normalizar caminho para o Pinecone (sempre use / mesmo no Windows)
            normalized_path = file_path.replace('\\', '/')
            metadata = {
                "source": normalized_path,
                "type": "pdf_chunk",
                "text_content": chunk_text,
                "chunk_index": i
            }
            index.upsert(vectors=[{"id": cid, "values": vector, "metadata": metadata}])
        return

    # Multimodal (Imagem, Vídeo)
    sanitized_filename = sanitize_vector_id(os.path.basename(file_path))
    fid = f"mm_{sanitized_filename}_{str(uuid.uuid4())[:8]}"
    # Normalizar caminho para o Pinecone (sempre use / mesmo no Windows)
    normalized_path = file_path.replace('\\', '/')
    metadata = {"source": normalized_path, "type": mod_type}
    try:
        uploaded_file = await upload_to_gemini(file_path)
        res = client.models.embed_content(model=EMBEDDING_MODEL, contents=uploaded_file)
        vector = res.embeddings[0].values
        metadata["gemini_file_uri"] = uploaded_file.uri
        metadata["text_content"] = f"Conteúdo Multimodal: {os.path.basename(file_path)}"
        index.upsert(vectors=[{"id": fid, "values": vector, "metadata": metadata}])
    except Exception as e:
        print(f"Erro indexação multimodal: {e}")

sb_lite = SupabaseLite(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_URL and SUPABASE_ANON_KEY else None

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

_local_stats = LocalStatsStore()

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
GENERATIVE_MODEL = "gemini-2.5-flash" # Modelo padrão de última geração

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

class SearchResult(BaseModel):
    id: str
    score: float
    metadata: dict

class ChatResponse(BaseModel):
    answer: str
    sources: List[SearchResult]

class StatIncrement(BaseModel):
    prompt_id: str
    type: str  # 'views', 'copies', 'shares'

@app.get("/api/documents")
async def list_documents():
    """Lista todos os documentos disponíveis para análise na pasta /data"""
    docs = []
    base_dir = "data"
    if not os.path.exists(base_dir):
        return []
        
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            ext = file.lower().split('.')[-1]
            # Filtramos apenas as extensões que o Gemini e Pinecone suportam no nosso workflow
            if ext in ['pdf', 'png', 'jpg', 'jpeg', 'mp4', 'mov', 'webm']:
                rel_path = os.path.relpath(os.path.join(root, file), base_dir).replace('\\', '/')
                docs.append({
                    "name": file,
                    "type": ext,
                    "path": rel_path
                })
    return docs

@app.delete("/api/documents/{filename:path}")
async def delete_document(filename: str):
    """Remove um documento da pasta /data e seus vetores correspondentes no Pinecone"""
    # Decodifica o caminho (útil para subpastas codificadas na URL)
    rel_path = unquote(filename)
    # Reconstrói o caminho completo no disco usando o separador correto do OS
    file_path = os.path.join("data", rel_path)
    
    if not os.path.exists(file_path):
        # Tenta sanitizar o caminho caso tenha vindo com barras invertidas
        file_path = os.path.join("data", rel_path.replace('\\', os.sep).replace('/', os.sep))
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Arquivo {rel_path} não encontrado no servidor em {file_path}")

    try:
        # 1. Remover do Pinecone usando filtro pelo metadado 'source'
        if index:
            # SEMPRE normaliza para forward slashes para bater com o padrão de indexação
            normalized_search_path = rel_path.replace('\\', '/')
            if not normalized_search_path.startswith('data/'):
                normalized_search_path = f"data/{normalized_search_path}"
            
            index.delete(filter={"source": {"$eq": normalized_search_path}})
            print(f"Vetores do documento {normalized_search_path} removidos do Pinecone.")

        # 2. Remover arquivo físico local
        os.remove(file_path)
        return {"status": "success", "message": f"Documento {rel_path} e seus índices vetoriais foram removidos com sucesso."}
        
    except Exception as e:
        print(f"Erro ao deletar documento {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao remover documento: {str(e)}")

@app.get("/api")
async def root():
    return {"message": "RAG Multimodal Agent API is running"}

@app.get("/api/stats/trending")
async def get_trending_stats():
    """Retorna estatísticas de trending (Mockup para evitar erros no frontend)"""
    return [
        {"id": "1", "title": "Manual de Integração", "views": 1250, "copies": 450},
        {"id": "2", "title": "Políticas de RH 2024", "views": 980, "copies": 320},
        {"id": "3", "title": "Guia Multimodal Gemini", "views": 840, "copies": 150}
    ]

@app.post("/api/search", response_model=ChatResponse)
async def search(search_query: SearchQuery):
    # Determinar qual cliente e modelo usar
    active_client = client
    active_model = search_query.model if search_query.model else GENERATIVE_MODEL

    # Se o usuário forneceu uma chave própria, gera um cliente temporário
    if search_query.gemini_api_key:
        try:
            active_client = genai.Client(api_key=search_query.gemini_api_key)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao inicializar cliente com sua chave Custom: {str(e)}")

    if not active_client or not index:
        raise HTTPException(status_code=503, detail="Serviços de IA (Gemini/Pinecone) não estão inicializados corretamente e nenhuma chave custom foi provida.")

    try:
        # 1. Gerar vetor da query (Busca Assimétrica)
        formatted_query = f"task: search result | query: {search_query.query}"
        
        embed_response = safe_embed_content(
            client=active_client,
            model=EMBEDDING_MODEL,
            contents=formatted_query
        )
        query_vector = embed_response.embeddings[0].values
        
        # 2. Consultar Pinecone (Retrieval)
        results = index.query(
            vector=query_vector,
            top_k=search_query.top_k,
            include_metadata=True
        )
        
        # 3. Consolidar contexto para o LLM
        context_text = ""
        formatted_results = []
        for match in results.matches:
            # Pega o texto extraído do PDF
            text = match.metadata.get("text_content", "")
            context_text += f"\n- {text}\n"
            
            # Formatar para o frontend (Exibição dos Cards)
            metadata = match.metadata
            if "source" in metadata:
                rel_path = metadata["source"].replace("data/", "")
                metadata["media_url"] = f"/media/{rel_path}"
                
            formatted_results.append(SearchResult(
                id=match.id,
                score=match.score,
                metadata=metadata
            ))
        
        # 4. Geração da Resposta (Augmented Generation)
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
            
        return ChatResponse(
            answer=ai_answer,
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
            friendly_msg = "A cota do Google Gemini foi atingida para este período (429). Por favor, aguarde cerca de 1 minuto ou mude para o modelo 'Gemini 1.5 Flash' nas configurações."
            raise HTTPException(status_code=429, detail=friendly_msg)
            
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno: {error_msg}")

@app.get("/api/stats/trending")
async def get_trending_stats():
    # Tenta Supabase
    if sb_lite:
        data = await sb_lite.get_trending()
        if data: return data
    
    # Fallback vazio
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

    return result if result else local_result

@app.post("/api/upload")
async def upload_file_endpoint(file: UploadFile = File(...)):
    if not os.path.exists("data"):
        os.makedirs("data")

    file_path = os.path.join("data", file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Determinar tipo
    ext = file.filename.lower().split('.')[-1]
    mod_type = "document" # Padrão
    if ext in ['png', 'jpg', 'jpeg']: mod_type = "image"
    elif ext in ['mp4', 'mov', 'webm']: mod_type = "video"
    
    # Processamento assíncrono (em background seria ideal, mas fazemos direto para simplificar o feedback)
    try:
        await process_and_index_file_internal(file_path, mod_type)
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
