---
name: Shadcn UI Components
description: Requirement for building UI with Shadcn, Radix UI, and Tailwind CSS.
---

# UI Components Skill

Esta skill define os padrões visuais e técnicos para a interface do Agente RAG.

## 🎨 Padrão Visual
- **Framework**: Tailwind CSS.
- **Biblioteca**: Shadcn UI (Radix UI).
- **Estilo**: Premium, moderno, com foco em modo escuro (Dark Mode), Glassmorphism e acessibilidade.

## 🛠️ Regras de Implementação
1. **Zero CSS Avulso**: Não criar arquivos `.css` individuais para novos componentes. Usar exclusivamente utilitários do Tailwind.
2. **Localização**: Componentes básicos devem residir em `frontend/src/components/ui/`.
3. **Instalação**: Sempre usar o CLI oficial: `npx shadcn@latest add <nome-do-componente>`.
4. **Ícones**: Usar exclusivamente a biblioteca `lucide-react`.

## 📂 Organização
- **UI Base**: `src/components/ui`.
- **Componentes de Negócio**: `src/components/features`.
- **Layouts**: `src/layouts`.
