import os
import httpx
import asyncio
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

async def test_supabase():
    print(f"=== Testando Conexão Supabase ===")
    print(f"URL: {SUPABASE_URL}")
    
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("❌ ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não encontradas no .env")
        return

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        try:
            # 1. Testar se a URL responde
            print("\n[1/2] Testando endpoint rest/v1...")
            response = await client.get(f"{SUPABASE_URL.rstrip('/')}/rest/v1/", headers=headers)
            if response.status_code == 200:
                print("✅ Conexão básica estabelecida com sucesso!")
            else:
                print(f"❌ Erro na conexão básica: Status {response.status_code}")
                print(f"Resposta: {response.text}")
                return

            # 2. Testar acesso à tabela 'prompt_statistics'
            print("\n[2/2] Testando acesso à tabela 'prompt_statistics'...")
            table_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/prompt_statistics?limit=1"
            table_response = await client.get(table_url, headers=headers)
            
            if table_response.status_code == 200:
                print("✅ Tabela 'prompt_statistics' acessada com sucesso!")
                data = table_response.json()
                print(f"Dados encontrados (limit 1): {data}")
            elif table_response.status_code == 404:
                print("❌ ERRO: Tabela 'prompt_statistics' não encontrada. Verifique se você criou a tabela no Supabase.")
            else:
                print(f"❌ Erro ao acessar tabela: Status {table_response.status_code}")
                print(f"Resposta: {table_response.text}")

        except Exception as e:
            print(f"❌ Ocorreu um erro inesperado: {e}")

if __name__ == "__main__":
    asyncio.run(test_supabase())
