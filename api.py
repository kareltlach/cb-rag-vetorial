import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Reusa a lógica de busca do script anterior
from pinecone import Pinecone
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

load_dotenv()

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

@app.get("/")
async def root():
    return {"message": "RAG Multimodal Agent API is running"}

@app.post("/search", response_model=ChatResponse)
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
                metadata["media_url"] = f"http://localhost:8000/media/{rel_path}"
                
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
