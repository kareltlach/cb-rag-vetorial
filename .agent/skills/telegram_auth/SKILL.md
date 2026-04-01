---
name: Telegram Authentication OTP
description: Flow for 100% free multi-factor authentication via Telegram Bot API and domain validation.
---

# Telegram Auth Skill

Este módulo documenta o fluxo de segurança do Casas Bahia RAG.

## 🔐 Camada 1: Validação de Domínio
- **Regra**: Apenas e-mails terminados em `@casasbahia.com.br` são aceitos.
- **Implementação**: Bloqueio ativo no frontend (`Auth.jsx`) e no fluxo de cadastro.

## 📱 Camada 2: Telegram OTP
- **Bot**: `@cb_rag_auth_bot`.
- **Fluxo**:
    1. O usuário se autentica no Supabase.
    2. O frontend verifica o status em `/api/auth/otp/status`.
    3. Se não verificado, pede o **Telegram Chat ID**.
    4. O bot envia um código de 6 dígitos via Telegram.
    5. O usuário valida o código em `/api/auth/otp/verify`.

## ⚙️ Configuração
- **Variáveis**: `TELEGRAM_BOT_TOKEN`.
- **Tabela**: `telegr_auth` (email, chat_id, otp_code, is_verified).
- **Expiração**: O código expira em 10 minutos por padrão no banco de dados.
