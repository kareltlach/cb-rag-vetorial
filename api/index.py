import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

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
GENERATIVE_MODEL = "gemini-2.5-flash"

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
            friendly_msg = "A cota do Google Gemini foi atingida para este período (429). Por favor, mude para o modelo 'Gemini 1.5 Flash' nas configurações ou aguarde 1 minuto."
            raise HTTPException(status_code=429, detail=friendly_msg)

        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno: {error_msg}")
