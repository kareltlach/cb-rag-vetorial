import os
import time
import uuid
from typing import List, Dict, Any
from dotenv import load_dotenv
from pinecone import Pinecone
from google import genai
from google.genai import types
from pypdf import PdfReader

# Carregar variáveis de ambiente
load_dotenv()

# Configurações globais
INDEX_NAME = "multimodal-rag"
EMBEDDING_MODEL = "gemini-embedding-2-preview"

# Inicializar clientes
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
index = pc.Index(INDEX_NAME)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def prepare_document(content, title=None):
    """
    Formata o texto do documento para buscas assimétricas (recuperação).
    """
    if title is None:
        title = "none"
    return f"title: {title} | text: {content}"

def upload_to_gemini(file_path: str, mime_type: str = None):
    """
    Faz o upload do arquivo para a API File do Gemini e espera estar ativo.
    """
    print(f"Fazendo upload do arquivo: {file_path}")
    file = client.files.upload(file=file_path)
    print(f"Upload completo. Referência uri: {file.uri}")
    
    # Alguns arquivos (vídeos longos) podem precisar de tempo de processamento
    # Para imagens e documentos curtos, geralmente é imediato, mas é boa prática verificar.
    while file.state.name == 'PROCESSING':
        print(".", end="", flush=True)
        time.sleep(2)
        # Atualiza o objeto file buscando-o novamente
        file = client.files.get(name=file.name)
        
    if file.state.name == 'FAILED':
        raise ValueError(f"Falha ao processar o arquivo {file.name}")
        
    print("\nArquivo pronto para uso!")
    return file

def generate_embedding(content, mime_type: str = "text/plain"):
    """
    Gera as representações vetoriais usando o modelo multimodal.
    Se o conteúdo for texto (string), trata como tal.
    Se o conteúdo for a referência do file do Gemini (File object), passa como parte.
    """
    
    # Preparar as partes baseadas no facto de ser objecto ou string(texto)
    # Se formos passar arquivos (File reference):
    if hasattr(content, 'uri'):
        embed_contents = content
    else:
        # Se formos passar texto:
        embed_contents = content

    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=embed_contents
    )
    
    vector = result.embeddings[0].values
    print(f"Vetor gerado com dimensão: {len(vector)}")
    return vector

def extract_text_chunks_from_pdf(pdf_path, chunk_size=1200, overlap=150):
    """Extrai texto do PDF e divide em blocos menores (chunks)."""
    text_chunks = []
    try:
        reader = PdfReader(pdf_path)
        full_text = ""
        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                full_text += f"\n[Página {page_num + 1}]\n" + page_text
        
        # Divide o texto completo em blocos com sobreposição
        start = 0
        while start < len(full_text):
            end = start + chunk_size
            chunk = full_text[start:end]
            text_chunks.append(chunk)
            start += (chunk_size - overlap)
            
    except Exception as e:
        print(f"Erro ao ler PDF {pdf_path}: {e}")
    return text_chunks

def process_and_index_file(file_path: str, mod_type: str, custom_text: str = None):
    """
    Processa arquivos e insere no Pinecone. 
    Se for PDF, faz extração de texto (chunking).
    """
    
    # CASO ESPECIAL: PDF com extração de texto (Chunking)
    if mod_type == "document" and file_path.lower().endswith(".pdf"):
        print(f"Extraindo texto e gerando chunks para: {file_path}")
        chunks = extract_text_chunks_from_pdf(file_path)
        print(f"Total de {len(chunks)} chunks gerados.")
        
        for i, chunk_text in enumerate(chunks):
            # Formatação assimétrica para busca
            formatted_text = f"task: search result | content: {chunk_text}"
            
            # Gerar embedding para o chunk de texto
            result = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=formatted_text
            )
            vector = result.embeddings[0].values
            
            chunk_id = f"{os.path.basename(file_path)}_ch_{i}_{str(uuid.uuid4())[:8]}"
            metadata = {
                "source": file_path,
                "type": "pdf_chunk",
                "text_content": chunk_text,
                "chunk_index": i
            }
            
            index.upsert(vectors=[{"id": chunk_id, "values": vector, "metadata": metadata}])
        print(f"Indexação de {file_path} concluída.")
        return

    # CASO PADRÃO: Imagens, vídeos ou texto simples
    file_id = str(uuid.uuid4())
    metadata = {
        "source": file_path,
        "type": mod_type,
    }
    
    try:
        if mod_type == "text":
            formatted_text = prepare_document(content=custom_text, title=os.path.basename(file_path) if file_path else "Texto_Manual")
            vector = generate_embedding(formatted_text)
            metadata["text_content"] = custom_text
        else:
            uploaded_file = upload_to_gemini(file_path)
            vector = generate_embedding(uploaded_file)
            metadata["gemini_file_uri"] = uploaded_file.uri
            metadata["text_content"] = "Conteúdo Multimodal (Imagem/Vídeo)"
    
        print(f"Inserindo vetor no Pinecone (ID: {file_id})")
        index.upsert(vectors=[{"id": file_id, "values": vector, "metadata": metadata}])
        print("Upsert concluído com sucesso!")
        
    except Exception as e:
        print(f"Erro ao processar {file_path}: {e}")

if __name__ == "__main__":
    print("Iniciando ingestão de dados multimodais base...")
    
    # Indexação iniciada via pastas de dados
    
    # =========================================================================
    # PARA TESTAR: Coloque algum arquivo local aqui para cadastrar
    # Exemplo: Comentar as linhas abaixo quando tiver os arquivos prontos.
    # =========================================================================
    
    # 1. Processando apenas as pastas de dados para evitar duplicidade
    
    # 3. Processando da pasta /data se houver itens
    data_folders = {
        "image": "data/images",
        "video": "data/videos",
        "document": "data/docs"
    }
    
    for mod_type, folder in data_folders.items():
        if os.path.exists(folder):
            for filename in os.listdir(folder):
                full_path = os.path.join(folder, filename)
                if os.path.isfile(full_path):
                    print(f"\nProcessando arquivo batch: {full_path}")
                    process_and_index_file(file_path=full_path, mod_type=mod_type)

    print("\nFinalizado o script de ingestão.")
