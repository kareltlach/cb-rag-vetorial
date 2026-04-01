import os
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv()

def wipe_pinecone():
    api_key = os.environ.get("PINECONE_API_KEY")
    index_name = "multimodal-rag"
    
    if not api_key:
        print("ALERTA: PINECONE_API_KEY não encontrada no .env")
        return

    try:
        pc = Pinecone(api_key=api_key)
        index = pc.Index(index_name)
        print(f"Limpando índice Pinecone: {index_name}")
        index.delete(delete_all=True)
        print("SUCESSO: Índice Pinecone limpo.")
    except Exception as e:
        print(f"ERRO: Falha ao limpar Pinecone: {e}")

if __name__ == "__main__":
    wipe_pinecone()
