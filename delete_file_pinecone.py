import os
from dotenv import load_dotenv
from pinecone import Pinecone

# Carregar variáveis de ambiente
load_dotenv()

# Configurações
INDEX_NAME = "multimodal-rag"

def delete_file_from_pinecone(filename):
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
    index = pc.Index(INDEX_NAME)
    
    print(f"=== Buscando vetores para: {filename} ===")
    
    # 1. Tentar listar IDs que começam com o nome do arquivo
    # IDs de chunks de PDF começam com o basename do arquivo
    ids_to_delete = []
    
    try:
        # Nota: list_paginated é útil para varrer o índice
        for ids in index.list(prefix=filename):
            ids_to_delete.extend(ids)
            
        if not ids_to_delete:
            print(f"Nenhum vetor encontrado com prefixo de ID: {filename}")
            # Tentar busca por filtro de metadados (source)
            # Como query exige um vetor, vamos usar um vetor dummy de zeros
            # Mas delete aceita filtro diretamente em índices serverless!
            
            print("Tentando exclusão direta por filtro de metadado 'source'...")
            # O Pinecone permite deletar por filtro diretamente
            delete_response = index.delete(filter={"source": {"$contains": filename}})
            print(f"Comando de exclusão por filtro enviado. Resposta: {delete_response}")
        else:
            print(f"Encontrados {len(ids_to_delete)} vetores para exclusão.")
            # Deletar em batches de 1000 (limite do Pinecone)
            for i in range(0, len(ids_to_delete), 1000):
                batch = ids_to_delete[i:i+1000]
                index.delete(ids=batch)
                print(f"Batch de {len(batch)} deletado.")
            
        print("\n=== Verificação final ===")
        stats = index.describe_index_stats()
        print(f"Estatísticas atuais do índice: {stats}")
        
    except Exception as e:
        print(f"Erro ao processar: {e}")

if __name__ == "__main__":
    target_file = "Ebook PBB Camp.pdf"
    delete_file_from_pinecone(target_file)
