import os
import httpx
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = "multimodal-rag"

async def reset_storage():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("Supabase credentials not found.")
        return
        
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    
    # 1. List objects in bucket
    list_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/list/rag-documents"
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(list_url, headers=headers, json={"prefix": ""})
            if res.status_code == 200:
                files = res.json()
                if not files:
                    print("Storage já está vazio.")
                    return
                    
                # 2. Bulk delete via IDs
                file_names = [f['name'] for f in files]
                del_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/rag-documents"
                # Supabase Storage API handles DELETE for multiple objects via JSON body
                res_del = await client.request("DELETE", del_url, headers=headers, json={"prefixes": file_names})
                if res_del.status_code == 200:
                    print(f"SUCESSO: {len(file_names)} arquivos removidos do Storage.")
                else:
                    # Fallback para deletar um por um se bulk falhar
                    for name in file_names:
                        single_del = f"{del_url}/{name}"
                        await client.delete(single_del, headers=headers)
                        print(f"Removido individualmente: {name}")
            else:
                print(f"Erro ao listar bucket ({res.status_code}): {res.text}")
        except Exception as e:
            print(f"Erro na limpeza do Storage: {e}")

def reset_pinecone():
    if not PINECONE_API_KEY:
        print("Pinecone API Key not found.")
        return
        
    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        index = pc.Index(INDEX_NAME)
        # Deletando tudo. Nota: namespace='' é o padrão.
        index.delete(delete_all=True)
        print("SUCESSO: Todos os vetores removidos do Pinecone.")
    except Exception as e:
        print(f"Falha ao limpar Pinecone: {e}")

if __name__ == "__main__":
    import asyncio
    print("Iniciando Zero-Base Reset...")
    reset_pinecone()
    asyncio.run(reset_storage())
    print("Operação concluída.")
