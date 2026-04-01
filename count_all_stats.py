import os
import httpx
import asyncio
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

async def get_total_stats():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("❌ Erro: Credenciais do Supabase não encontradas no .env")
        return

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        try:
            # Buscar todos os registros da tabela prompt_statistics
            url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/prompt_statistics"
            response = await client.get(url, headers=headers)
            
            if response.status_code != 200:
                print(f"❌ Erro ao buscar dados: {response.status_code}")
                print(response.text)
                return

            data = response.json()
            
            total_views = sum(item.get('views', 0) for item in data)
            total_copies = sum(item.get('copies', 0) for item in data)
            total_shares = sum(item.get('shares', 0) for item in data)
            total_prompts = len(data)

            print("\n=== ESTATÍSTICAS TOTAIS DO SUPABASE ===")
            print(f"Total de Prompts Únicos: {total_prompts}")
            print(f"👁️ Total de Visualizações: {total_views}")
            print(f"📋 Total de Cópias: {total_copies}")
            print(f"👥 Total de Compartilhamentos: {total_shares}")
            print("=======================================\n")

            if total_prompts > 0:
                print("Detalhes por Prompt:")
                for item in sorted(data, key=lambda x: x.get('views', 0), reverse=True):
                    name = item.get('prompt_id', 'Desconhecido')
                    v = item.get('views', 0)
                    c = item.get('copies', 0)
                    s = item.get('shares', 0)
                    print(f"- {name}: 👁️ {v} | 📋 {c} | 👥 {s}")

        except Exception as e:
            print(f"❌ Erro inesperado: {e}")

if __name__ == "__main__":
    asyncio.run(get_total_stats())
