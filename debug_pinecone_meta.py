import os
from dotenv import load_dotenv
from pinecone import Pinecone

# Carregar variáveis de ambiente
load_dotenv()

# Configurações
INDEX_NAME = "multimodal-rag"

def debug_pinecone():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
    index = pc.Index(INDEX_NAME)
    
    print("=== Buscando estatísticas e exemplos ===")
    stats = index.describe_index_stats()
    print(f"Stats: {stats}")
    
    # Vamos listar os primeiros 10 IDs para ver o formato
    print("\n=== Exemplo de 10 IDs ===")
    ids = []
    for results in index.list(limit=10):
        ids.extend(results)
    
    for id in ids:
        fetch_res = index.fetch([id])
        meta = fetch_res.vectors[id].metadata
        print(f"ID: {id} | Source: {meta.get('source')}")

if __name__ == "__main__":
    debug_pinecone()
