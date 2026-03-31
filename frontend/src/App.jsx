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
  const [documents, setDocuments] = useState([])
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const chatEndRef = useRef(null)

  // ── Carregar lista de documentos na inicialização ──────────────────────────
  useEffect(() => {
    const fetchDocuments = async () => {
      setSidebarLoading(true)
      try {
        const response = await fetch(`${API_BASE}/api/documents`)
        if (response.ok) {
          const data = await response.json()
          setDocuments(data)
        }
      } catch (err) {
        console.error('Erro ao carregar documentos:', err)
      } finally {
        setSidebarLoading(false)
      }
    }
    fetchDocuments()
  }, [])

  // ── Markdown renderer com suporte a blocos de código copiáveis ──────────────
  const [copiedIdx, setCopiedIdx] = useState({})

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCopiedIdx(prev => ({ ...prev, [key]: false })), 2000)
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
      const promptRegex = /(Prompt:?\s*\n?(?:> .*(\n|$))+)/gi
      if (promptRegex.test(part)) {
        const subParts = part.split(promptRegex)
        return subParts.map((sub, si) => {
          if (promptRegex.test(sub)) {
            const cleanPrompt = sub.replace(/^Prompt:?\s*\n?/i, '').replace(/^> /gm, '').trim()
            return renderCodeBlock(cleanPrompt, `sub-code-${i}-${si}`)
          }
          return renderInline(sub, `text-${i}-${si}`)
        })
      }

      return renderInline(part, i)
    })
  }

  const renderInline = (text, baseKey) => {
    const lines = text.split('\n')
    return lines.map((line, li) => {
      const key = `${baseKey}-${li}`
      if (!line.trim()) return <div key={key} style={{ height: '0.4rem' }} />
      if (line.startsWith('### ')) return <h4 key={key} className="md-h4">{renderSpan(line.slice(4))}</h4>
      if (line.startsWith('## ')) return <h3 key={key} className="md-h3">{renderSpan(line.slice(3))}</h3>
      if (/^[\*\-] /.test(line)) return <li key={key} className="md-li">{renderSpan(line.slice(2))}</li>
      return <p key={key} className="md-p">{renderSpan(line)}</p>
    })
  }

  const renderSpan = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="md-inline-code">{p.slice(1, -1)}</code>
      return p
    })
  }

  // ── Sidebar Component ──────────────────────────────────────────────────────
  const Sidebar = () => {
    const getIcon = (type) => {
      if (type === 'pdf') return '📄'
      if (['jpg', 'jpeg', 'png'].includes(type)) return '🖼️'
      if (['mp4', 'mov', 'webm'].includes(type)) return '🎬'
      return '📁'
    }

    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Analisando agora</h2>
        </div>
        
        {sidebarLoading ? (
          <div className="loader"><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
        ) : (
          <div className="doc-list">
            {documents.length > 0 ? documents.map((doc, idx) => (
              <div key={idx} className="doc-item">
                <div className="doc-icon">{getIcon(doc.type)}</div>
                <div className="doc-info">
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">{doc.type}</div>
                </div>
              </div>
            )) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '1rem' }}>
                Nenhum documento encontrado em /data.
              </p>
            )}
          </div>
        )}
      </aside>
    )
  }

  // ── Interaction Logic ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('rag-settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSearch = async () => {
    if (!input.trim()) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setLastQuery(input)
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
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: `❌ Erro: ${error.message}` 
      }])
    } finally {
      setIsLoading(false)
    }
  }

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

  return (
    <div className="app-layout">
      <Sidebar />
      
      <main className="main-content">
        <header className="header">
          <div className="header-content">
            <h1>Grupo Casas Bahia RAG</h1>
            <p>Embeddings 2 & Pinecone Multimodal Experience</p>
          </div>
          <button className="settings-toggle" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
        </header>

        <section className="chat-window">
          {messages.map((m, idx) => (
            <div key={idx} className={`message ${m.role}`}>
              <div className="message-content">
                {renderMarkdown(m.content)}
              </div>
              
              {m.results && (
                <div className="results-container">
                  {m.results.map((res, ridx) => (
                    <div key={ridx} className="result-card" onClick={() => setSelectedResult(res)}>
                      <span className="result-type">{res.metadata.type || 'Documento'}</span>
                      <span className="result-title">{res.metadata.filename || res.id}</span>
                      <p className="result-content">{res.metadata.text_content}</p>
                      <span className="result-score">Score: {(res.score * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="message ai">
              <div className="loader">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </section>

        <footer className="input-area">
          <input 
            type="text" 
            placeholder="Pergunte sobre seus dados..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="send-btn" onClick={handleSearch}>🚀</button>
        </footer>
      </main>

      {/* Modal de Detalhes */}
      {selectedResult && (
        <div className="modal-overlay" onClick={() => setSelectedResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedResult(null)}>✕</button>
            <h2 className="modal-title">{selectedResult.metadata.source?.split('\\').pop() || 'Detalhes'}</h2>
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
