import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

load_dotenv()

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
GENERATIVE_MODEL = "gemini-3.1-flash-lite-preview"

SYSTEM_PROMPT = """
Você é um especialista em Design e Experiência do Usuário (UX). 
Sua missão é atuar como um Agente Tutor amigável que responde em Português do Brasil.

INSTRUÇÕES:
1. Use os 'TRECHOS DE DOCUMENTOS' fornecidos abaixo para responder à pergunta do usuário.
2. Formate sua resposta como um **passo a passo ou tutorial curto** sempre que possível.
3. Se a informação não estiver presente nos documentos, diga gentilmente que não encontrou esse detalhe específico no material indexado.
4. Mantenha um tom profissional, mas acessível.

---
TRECHOS DE DOCUMENTOS:
{context}
---
"""

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

def is_rate_limit_error(exception):
    return "429" in str(exception) or "RESOURCE_EXHAUSTED" in str(exception)

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception)
)
def safe_embed_content(client, model, contents):
    try:
        return client.models.embed_content(model=model, contents=contents)
    except Exception as e:
        if is_rate_limit_error(e):
            print(f"Limite de cota atingido na incorporação. Tentando novamente...")
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

@app.get("/api")
async def root():
    return {"message": "RAG Multimodal Agent API is running"}

@app.post("/api/search", response_model=ChatResponse)
async def search(search_query: SearchQuery):
    active_client = client
    active_model = search_query.model if search_query.model else GENERATIVE_MODEL

    if search_query.gemini_api_key:
        try:
            active_client = genai.Client(api_key=search_query.gemini_api_key)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao inicializar cliente com sua chave Custom: {str(e)}")

    if not active_client or not index:
        raise HTTPException(status_code=503, detail="Serviços de IA (Gemini/Pinecone) não estão inicializados. Configure as variáveis de ambiente no Vercel.")

    try:
        formatted_query = f"task: search result | query: {search_query.query}"
        
        embed_response = safe_embed_content(
            client=active_client,
            model=EMBEDDING_MODEL,
            contents=formatted_query
        )
        query_vector = embed_response.embeddings[0].values
        
        results = index.query(
            vector=query_vector,
            top_k=search_query.top_k,
            include_metadata=True
        )
        
        context_text = ""
        formatted_results = []
        for match in results.matches:
            text = match.metadata.get("text_content", "")
            context_text += f"\n- {text}\n"
            
            metadata = match.metadata
            formatted_results.append(SearchResult(
                id=match.id,
                score=match.score,
                metadata=metadata
            ))
        
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
        print(f"ERRO CRÍTICO NO BACKEND: {error_msg}")
        
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            raise HTTPException(status_code=429, detail="A cota do Google Gemini foi atingida. Aguarde e tente novamente.")
        
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno: {error_msg}")
