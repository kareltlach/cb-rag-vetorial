# 🚀 Casas Bahia RAG Multimodal Agent

Um assistente inteligente de busca semântica (RAG) que transcende o texto: analise **PDFs, Imagens e Vídeos** usando o poder do Google Gemini e Pinecone.

![Status do Projeto](https://img.shields.io/badge/Status-Desenvolvimento-green)
![Tecnologias](https://img.shields.io/badge/Stack-FastAPI%20|%20React%20|%20Supabase-blue)

## ✨ Principais Funcionalidades

- **Busca Multimodal**: Envie documentos, fotos de dashboards ou vídeos de treinamento e pergunte sobre eles.
- **Métricas em Tempo Real**: Acompanhe o engajamento dos seus prompts (Visualizações, Cópias e Compartilhamentos no Teams) integrados via Supabase.
- **Top Trending**: Sidebar dinâmica com os prompts mais utilizados pela comunidade.
- **Interface Premium**: Design moderno, responsivo e com suporte a visualização de código formatada.
- **Gestão de Documentos**: Adicione ou remova arquivos da base vetorial diretamente pela interface.

---

## 🛠️ Pré-requisitos

Antes de começar, você precisará ter instalado:
- **Node.js** (v18 ou superior)
- **Python** (v3.9 ou superior)
- **Git**
- Uma conta no [Google AI Studio](https://aistudio.google.com/) (Gemini API)
- Uma conta no [Pinecone](https://www.pinecone.io/) (Vetor Database)
- Um projeto no [Supabase](https://supabase.com/) (Database de métricas)

---

## ⚙️ Configuração do Ambiente

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/kareltlach/cb-rag-vetorial.git
   cd cb-rag-vetorial
   ```

2. **Crie o arquivo `.env` na raiz do projeto:**
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   PINECONE_API_KEY=sua_chave_aqui
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=sua_chave_anonima_aqui
   ```

3. **Configure o Banco de Dados (Supabase):**
   - Acesse o **SQL Editor** no painel do Supabase.
   - Execute o script contido no arquivo `supabase_migration.sql` para criar a tabela de métricas e as políticas de segurança.

---

## 📦 Instalação

O projeto possui um orquestrador na raiz que facilita a instalação:

1. **Instale as dependências de todo o sistema:**
   ```bash
   npm run install-all
   ```
   *(Este comando instala as dependências da raiz, do frontend e prepara o ambiente)*

2. **Instale as dependências do Python (Backend):**
   ```bash
   pip install -r requirements.txt
   ```

---

## 🚀 Como Rodar

Basta um único comando para subir o Backend (Python) e o Frontend (React) simultaneamente:

```bash
npm run dev
```

- **Frontend**: Acesse em `http://localhost:5173`
- **Backend (API)**: Rodando em `http://127.0.0.1:8001`

---

## 📂 Estrutura do Projeto

- `/api`: Endpoints serverless para deploy na Vercel.
- `/frontend`: Aplicação SPA React (Vite).
- `/data`: Armazenamento local de documentos indexados.
- `api.py`: Backend principal (FastAPI).
- `package.json`: Scripts de automação e orquestração.
- `supabase_migration.sql`: Script SQL para inicialização do banco.

---

## 📝 Notas de Versão (v2.0)

- [x] Automação de inicialização via `concurrently`.
- [x] Integração completa de métricas real-time no Supabase.
- [x] Correção de race conditions no boot do backend.
- [x] Adição de tooltips para nomes de arquivos longos.
- [x] Limpeza de arquivos legados e logs.

---

### 🤝 Contribuição
Fique à vontade para abrir Issues ou Pull Requests para melhorias no sistema de RAG ou na Interface!

**Desenvolvido com ❤️ para a Casas Bahia.**
