---
name: RAG Core Operations
description: Instructions for managing the multimodal RAG pipeline (Pinecone + Gemini) in the Casas Bahia project.
---

# RAG Core Skills

Este módulo define como o agente deve manipular o pipeline de Recuperação Aumentada por Geração (RAG).

## 🗂️ Indexação
- **Pinecone Index**: `multimodal-rag`.
- **Dimensões**: 768 (Gemini Embedding).
- **Processamento**: Documentos PDF são divididos em pedaços de 1200 caracteres com 150 de sobreposição.

## 🤖 Modelos Utilizados
- **Embeddings**: `gemini-embedding-2-preview`.
- **Chat/Reasoning**: `gemini-3-flash-preview`.

## 📜 Regras de Resposta
1. Sempre responder em Português (PT-BR).
2. Priorizar os documentos recuperados no contexto.
3. Formatar prompts sugeridos em blocos de código (```).
