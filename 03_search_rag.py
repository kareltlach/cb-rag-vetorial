import os
from dotenv import load_dotenv
from pinecone import Pinecone
from google import genai

# Carregar variáveis de ambiente
load_dotenv()

# Configurações globais
INDEX_NAME = "multimodal-rag"
EMBEDDING_MODEL = "gemini-embedding-2-preview"

# Inicializar clientes
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
index = pc.Index(INDEX_NAME)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def prepare_query(query: str):
    """
    Formata a query para tarefas assimétricas de busca (Retrieval-Augmented Generation).
    Deve casar com a formatação de preparo dos documentos!
    """
    return f"task: search result | query: {query}"

def search_pinecone(query: str, top_k: int = 3):
    """
    1. Prepara a query com o prefixo correto temporal.
    2. Gera o vetor da pesquisa com o gemini-embedding-2-preview.
    3. Busca os k-vizinhos mais próximos no Pinecone.
    """
    formatted_query = prepare_query(query)
    
    print(f"Gerando vetor de busca para: '{query}'")
    embed_response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=formatted_query
    )
    query_vector = embed_response.embeddings[0].values
    
    print(f"Buscando os {top_k} resultados mais relevantes no banco...")
    search_results = index.query(
        vector=query_vector,
        top_k=top_k,
        include_metadata=True
    )
    
    return search_results

if __name__ == "__main__":
    banner = """
    ===================================================
    | Busca RAG Multimodal (Vídeo, Imagem, PDF, Texto) |
    ===================================================
    """
    print(banner)
    
    user_query = input("\nO que você deseja buscar no banco de dados? \n>>> ")
    
    try:
        results = search_pinecone(user_query)
        print("\n--- RESULTADOS ---")
        
        if not results.matches:
            print("Nenhum resultado encontrado. O índice pode estar vazio.")
        
        for i, match in enumerate(results.matches):
            print(f"\n[{i+1}] Score de Relevância: {match.score:.4f}")
            print(f"ID do Arquivo: {match.id}")
            
            # Print dos metadados extraídos
            meta = match.metadata
            print(f"Tipo do Dado: {meta.get('type')}")
            print(f"Fonte (Path Local): {meta.get('source')}")
            
            # Se for texto, mostramos o pedaço do texto no print
            if meta.get("type") == "text":
                print(f"Conteúdo: {meta.get('text_content')}")
            else:
                # É imagem, vídeo ou PDF! Mostramos o URI do Gemini
                print(f"Arquivo Gemini (URI): {meta.get('gemini_file_uri')}")
    except Exception as e:
        print(f"\nOcorreu um erro durante a busca: {e}")
