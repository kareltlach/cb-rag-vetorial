import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec

# Carregar variáveis de ambiente
load_dotenv()

# Inicializar cliente Pinecone
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))

# Nome do índice
index_name = "multimodal-rag"

# O modelo gemini-embedding-2-preview produz vetores de 3072 dimensões por padrão
dimension = 3072

print(f"Verificando a existência do índice '{index_name}'...")
existing_indexes = [index_info["name"] for index_info in pc.list_indexes()]

if index_name in existing_indexes:
    print(f"O índice '{index_name}' já existe. Verificando dimensões...")
    index_desc = pc.describe_index(index_name)
    if index_desc.dimension != dimension:
        print(f"Dimensão incorreta ({index_desc.dimension}). Deletando para recriar com {dimension}...")
        pc.delete_index(index_name)
        existing_indexes.remove(index_name)
        import time
        time.sleep(10) # Tempo para deleção no Pinecone

if index_name not in existing_indexes:
    print(f"Criando o índice '{index_name}' com dimensão {dimension}...")
    pc.create_index(
        name=index_name,
        dimension=dimension,
        metric="cosine", # Recomendado para similaridade semântica
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1"
        )
    )
    print("Índice criado com sucesso!")
else:
    print(f"O índice '{index_name}' já existe.")

# Obter as estatísticas do índice para provar que está online
index = pc.Index(index_name)
stats = index.describe_index_stats()
print(f"Status do índice: {stats}")
