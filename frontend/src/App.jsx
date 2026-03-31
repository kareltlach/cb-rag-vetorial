import React, { useState, useRef, useEffect } from 'react'
import './index.css'

// URL base da API — Vite proxy redireciona /api no dev, Vercel serverless em produção
const API_BASE = ''

function App() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Olá! Sou seu assistente RAG Multimodal. Pergunte-me qualquer coisa sobre seus documentos, imagens ou vídeos.' }
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('rag-settings')
    return saved ? JSON.parse(saved) : {
      apiKey: '',
      model: 'gemini-2.5-flash'
    }
  })
  const [lastQuery, setLastQuery] = useState('')
  const chatEndRef = useRef(null)

  // ── Markdown renderer com suporte a blocos de código copiáveis ──────────────
  const [copiedIdx, setCopiedIdx] = useState({})

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCopiedIdx(prev => ({ ...prev, [key]: false })), 2000)
    })
  }

  const renderMarkdown = (text) => {
    if (!text) return null
    // 1. Tenta identificar blocos de código com ```
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      // Bloco de código padrão
      if (part.startsWith('```')) {
        const inner = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim()
        return renderCodeBlock(inner, `code-${i}`)
      }
      
      // 2. Tenta identificar se o texto "normal" contém citações (>) que parecem prompts
      // (ex: Crie uma..., Atue como..., Gere...)
      const promptRegex = /(Prompt:?\s*\n?(?:> .*(\n|$))+)/gi
      if (promptRegex.test(part)) {
        const subParts = part.split(promptRegex)
        return subParts.map((sub, si) => {
          if (promptRegex.test(sub)) {
            // Limpa os marcadores de citação (>) para exibir o prompt limpo
            const cleanPrompt = sub.replace(/^Prompt:?\s*\n?/i, '').replace(/^> /gm, '').trim()
            return renderCodeBlock(cleanPrompt, `sub-code-${i}-${si}`)
          }
          return renderInline(sub, `text-${i}-${si}`)
        })
      }

      // Texto normal — renderiza markdown inline
      return renderInline(part, i)
    })
  }

  const renderCodeBlock = (inner, key) => {
    const lines = inner.trim().split('\n')
    return (
      <div key={key} className="code-block">
        <div className="code-block-header">
          <span className="code-block-label">📋 Prompt de Pesquisa</span>
          <button
            className={`copy-btn ${copiedIdx[key] ? 'copied' : ''}`}
            onClick={() => copyToClipboard(inner.trim(), key)}
          >
            {copiedIdx[key] ? '✓ Copiado!' : 'Copiar Prompt'}
          </button>
        </div>
        <div className="code-editor-container">
          <div className="line-numbers">
            {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <pre className="code-block-content">
            <code>
              {lines.map((line, i) => (
                <div key={i} className="code-line">{line || '\u00A0'}</div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    )
  }

  const renderInline = (text, baseKey) => {
    const lines = text.split('\n')
    return lines.map((line, li) => {
      const key = `${baseKey}-${li}`
      // Linha vazia
      if (!line.trim()) return <br key={key} />
      // Cabeçalhos ### e ##
      if (line.startsWith('### ')) return <h4 key={key} className="md-h4">{renderSpan(line.slice(4))}</h4>
      if (line.startsWith('## ')) return <h3 key={key} className="md-h3">{renderSpan(line.slice(3))}</h3>
      // Item de lista com * ou -
      if (/^[\*\-] /.test(line)) return <li key={key} className="md-li">{renderSpan(line.slice(2))}</li>
      // Linha normal
      return <p key={key} className="md-p">{renderSpan(line)}</p>
    })
  }

  const renderSpan = (text) => {
    // Bold **texto** e inline `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="md-inline-code">{p.slice(1, -1)}</code>
      return p
    })
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Função para destacar termos de busca no texto
  const renderHighlightedText = (text, query) => {
    if (!query.trim() || !text) return text;
    const terms = query.trim().split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return text;
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="highlight-text">{part}</mark> : part
    );
  };

  useEffect(() => {
    localStorage.setItem('rag-settings', JSON.stringify(settings))
  }, [settings])

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setLastQuery(input) // Armazena a query para o destaque visual
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: input, 
          top_k: 5,
          model: settings.model,
          gemini_api_key: settings.apiKey || null
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Falha na conexão com o servidor.' }))
        throw new Error(errorData.detail || 'Erro ao processar solicitação.')
      }

      const data = await response.json()
      
      const aiResponse = { 
        role: 'ai', 
        content: data.answer,
        results: data.sources 
      }
      
      setMessages(prev => [...prev, aiResponse])
    } catch (error) {
      console.error(error)
      setMessages(prev => [...prev, { role: 'ai', content: error.message || 'Ops! Ocorreu um erro ao processar sua solicitação no servidor.' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <h1>Grupo Casas Bahia <span>RAG</span></h1>
          <p>Embeddings 2 & Pinecone Multimodal Experience</p>
        </div>
        <button className="settings-toggle" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      <div className="chat-window">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-text">
              {msg.role === 'ai' ? renderMarkdown(msg.content) : msg.content}
            </div>
            
            {msg.results && msg.results.length > 0 && (
              <div className="results-container">
                <p className="results-label">Fontes consultadas:</p>
                {msg.results.map((res, ridx) => (
                  <div key={ridx} className="result-card" onClick={() => setSelectedResult(res)}>
                    <span className="result-type">{res.metadata.type || 'Text'}</span>
                    <h4 className="result-title">{res.metadata.source ? res.metadata.source.split('\\').pop() : 'Fonte Desconhecida'}</h4>
                    <p className="result-content">
                      {renderHighlightedText(res.metadata.text_content || 'Conteúdo multimodal', lastQuery)}
                    </p>
                    <span className="result-score">Confiança: {(res.score * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="message ai">
            <div className="loader">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="input-area" onSubmit={handleSearch}>
        <input 
          type="text" 
          placeholder="O que você deseja saber?" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" className="send-btn" disabled={isLoading}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>

      {/* Modal de Detalhes */}
      {selectedResult && (
        <div className="modal-overlay" onClick={() => setSelectedResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedResult(null)}>✕</button>
            <h2 className="modal-title">{selectedResult.metadata.source.split('\\').pop()}</h2>
            <div className="modal-body">
              {renderHighlightedText(selectedResult.metadata.text_content, lastQuery)}
            </div>
            <div className="modal-meta">
              <span>Tipo: {selectedResult.metadata.type}</span>
              <span>Score de Relevância: {(selectedResult.score * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Configurações */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsSettingsOpen(false)}>✕</button>
            <h2 className="modal-title">Configurações Gemini</h2>
            
            <div className="settings-group">
              <label>Escolher Modelo:</label>
              <select 
                value={settings.model} 
                onChange={(e) => setSettings({...settings, model: e.target.value})}
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</option>
                <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Preview)</option>
              </select>
            </div>

            <div className="settings-group">
              <label>Sua API Key (Opcional):</label>
              <input 
                type="password" 
                placeholder="AIzaSy..." 
                value={settings.apiKey}
                onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
              />
              <p className="settings-hint">Deixe em branco para usar a chave padrão do servidor.</p>
            </div>

            <button className="save-btn" onClick={() => setIsSettingsOpen(false)}>Salvar e Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
