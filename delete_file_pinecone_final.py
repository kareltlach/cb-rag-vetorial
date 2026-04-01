import os
from dotenv import load_dotenv
from pinecone import Pinecone

# Carregar variáveis de ambiente
load_dotenv()

# Configurações
INDEX_NAME = "multimodal-rag"

def remove_complete_file():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
    index = pc.Index(INDEX_NAME)
    
    print("=== Iniciando remoção completa de 'Ebook PBB Camp.pdf' ===")
    
    ids_to_delete = []
    all_ids = []
    
    # Listar todos os IDs no namespace (padrão é "")
    print("Listando todos os IDs no índice...")
    for ids in index.list():
        all_ids.extend(ids)
    
    print(f"Total de vetores no índice: {len(all_ids)}")
    
    for id in all_ids:
        # Verificar se o ID contém o nome do arquivo (com variações de espaço/underline)
        id_lower = id.lower()
        if "ebook" in id_lower and "pbb" in id_lower and "camp" in id_lower:
            ids_to_delete.append(id)
            continue
            
        # Opcional: verificar metadados se o ID não for óbvio
        # fetch_res = index.fetch([id])
        # meta = fetch_res.vectors[id].metadata
        # source = meta.get('source', '').lower()
        # if "ebook" in source and "pbb" in source and "camp" in source:
        #     ids_to_delete.append(id)
    
    if not ids_to_delete:
        print("Nenhum vetor identificado para exclusão.")
        return
        
    print(f"Identificados {len(ids_to_delete)} vetores para excluir.")
    
    # Deletar em batches
    for i in range(0, len(ids_to_delete), 100):
        batch = ids_to_delete[i:i+100]
        index.delete(ids=batch)
        print(f"Deletado batch de {len(batch)} IDs.")
        
    print("\n=== Remoção Concluída ===")
    stats = index.describe_index_stats()
    print(f"Estatísticas finais: {stats}")

if __name__ == "__main__":
    remove_complete_file()
