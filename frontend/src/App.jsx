import React, { useState, useRef, useEffect } from 'react'
import './index.css'

// URL base da API — Vite proxy redireciona /api no dev, Vercel serverless em produção
const API_BASE = ''

const getStatKey = (text) => {
  if (!text) return 'p-empty'
  const clean = text.trim()
  // Cria um "slug" legível dos primeiros 25 caracteres para servir de título
  const slug = clean.substring(0, 25)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .substring(0, 20)
  return `p-${clean.length}-${slug}`
}

const beautifyPromptId = (id) => {
  if (!id || !id.startsWith('p-')) return id
  const parts = id.split('-')
  if (parts.length < 3) return `Prompt #${parts[1] || '?'}`
  // Pega o slug e transforma de volta em texto legível
  const slug = parts.slice(2).join('-')
  const readable = slug.replace(/_/g, ' ')
  return readable.charAt(0).toUpperCase() + readable.slice(1)
}

// Componente para renderizar o bloco de código com tracking de visualização
const PromptCodeBlock = ({ inner, blockKey, isWordWrap, setIsWordWrap, copyToClipboard, shareToTeams, copiedIdx, updateStat }) => {
  const [stats, setStats] = useState({ views: 0, copies: 0, shares: 0 })
  const lines = inner.trim().split('\n')
  const key = getStatKey(inner.trim())

  useEffect(() => {
    // Buscar estatísticas atuais
    fetch(`${API_BASE}/api/stats/${key}`)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Erro ao buscar stats:', err))

    // Marcar visualização
    updateStat(inner.trim(), 'views')
      .then(success => {
        if (success) setStats(prev => ({ ...prev, views: prev.views + 1 }))
      })
  }, [])

  return (
    <div key={blockKey} className={`code-block ${isWordWrap ? 'word-wrap' : ''}`}>
      <div className="code-block-header">
        <span className="code-block-label">📋 Prompt de Pesquisa</span>
        <div className="code-block-actions">
          <button 
            className={`wrap-toggle-btn ${isWordWrap ? 'active' : ''}`}
            onClick={() => setIsWordWrap(!isWordWrap)}
            title="Toggle Word Wrap"
          >
            {isWordWrap ? 'Wrap: ON' : 'Wrap: OFF'}
          </button>
          <button
            className="share-teams-btn"
            onClick={() => shareToTeams(inner.trim())}
            title="Compartilhar no Microsoft Teams"
          >
            Teams
          </button>
          <button
            className={`copy-btn ${copiedIdx[blockKey] ? 'copied' : ''}`}
            onClick={() => copyToClipboard(inner.trim(), blockKey)}
          >
            {copiedIdx[blockKey] ? '✓ Copiado!' : 'Copiar Prompt'}
          </button>
        </div>
      </div>
      <div className="code-editor-container">
        {stats.views > 50 && (
          <div className="popular-badge" title="Este prompt está em alta!">
            🔥 Popular
          </div>
        )}
        {!isWordWrap && (
          <div className="line-numbers">
            {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
        )}
        <pre className="code-block-content">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="code-line">{line || '\u00A0'}</div>
            ))}
          </code>
        </pre>
      </div>
      <div className="code-block-footer">
        <div className="stats-container">
          <span className="stat-item" title="Visualizações">👁️ {stats.views}</span>
          <span className="stat-item" title="Cópias">📋 {stats.copies}</span>
          <span className="stat-item" title="Compartilhamentos no Teams">👥 {stats.shares}</span>
        </div>
      </div>
    </div>
  )
}

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024)
  const [isWordWrap, setIsWordWrap] = useState(true)
  const [trending, setTrending] = useState([])
  const chatEndRef = useRef(null)

  // ── Carregar lista de documentos e trending na inicialização ──────────────────────────
  useEffect(() => {
    fetchDocuments()
    fetchTrending()
  }, [])

  const fetchTrending = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stats/trending`)
      const data = await response.json()
      setTrending(data)
    } catch (err) {
      console.error('Erro ao buscar trending:', err)
    }
  }

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

  // ── Markdown renderer com suporte a blocos de código copiáveis ──────────────
  const [copiedIdx, setCopiedIdx] = useState({})

  const copyToClipboard = (text, key) => {
    updateStat(text, 'copies')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCopiedIdx(prev => ({ ...prev, [key]: false })), 2000)
    })
  }

  const shareToTeams = (text) => {
    updateStat(text, 'shares')
    const encodedText = encodeURIComponent(text)
    const teamsUrl = `https://teams.microsoft.com/share?msgText=${encodedText}`
    window.open(teamsUrl, '_blank')
  }

  const updateStat = async (text, type) => {
    try {
      const response = await fetch(`${API_BASE}/api/stats/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: getStatKey(text), type })
      })
      const result = await response.json()
      return result.status === 'success'
    } catch (err) {
      console.error('Erro ao salvar stat:', err)
      return false
    }
  }

  const renderCodeBlock = (inner, key) => {
    return (
      <PromptCodeBlock 
        inner={inner} 
        blockKey={key} 
        isWordWrap={isWordWrap}
        setIsWordWrap={setIsWordWrap}
        copyToClipboard={copyToClipboard}
        shareToTeams={shareToTeams}
        copiedIdx={copiedIdx}
        updateStat={updateStat}
      />
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
}

// ── Sidebar Component (Moved outside App for better stability) ───────────────
const Sidebar = ({ isSidebarOpen, setIsSidebarOpen, sidebarLoading, documents, trending, setInput }) => (
  <>
    {isSidebarOpen && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)} />}
    <aside className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-sparkle">✨</div>
          <h2 className="sidebar-title">Analisando Agora</h2>
        </div>
        <button className="sidebar-close-mobile" onClick={() => setIsSidebarOpen(false)}>×</button>
      </div>
      
      <div className="sidebar-section">
        <h2 className="section-label">📂 Documentos em /data</h2>
        <ul className="document-list">
          {sidebarLoading ? (
            <div className="loading-spinner-small"></div>
          ) : documents.length > 0 ? (
            documents.map((doc, idx) => (
              <li key={idx} className="document-item">
                <span className="doc-icon">
                  {['png', 'jpg', 'jpeg'].includes(doc.type) ? '🖼️' : 
                   ['mp4', 'mov', 'webm'].includes(doc.type) ? '🎬' : '📄'}
                </span>
                <div className="doc-info">
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">{doc.type}</div>
                </div>
              </li>
            ))
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '1rem' }}>
              Nenhum documento encontrado em /data.
            </p>
          )}
        </ul>
      </div>

      {trending.length > 0 && (
        <div className="sidebar-section trending-section">
          <h2 className="section-label">🔥 Mais Utilizados</h2>
          <ul className="trending-list">
            {trending.map((item, idx) => (
              <li 
                key={idx} 
                className="trending-item" 
                onClick={() => {
                  setInput(beautifyPromptId(item.prompt_id))
                }}
              >
                <div className="trending-info">
                  <span className="trending-name">{beautifyPromptId(item.prompt_id)}</span>
                  <div className="trending-stats">
                    <span>👁️ {item.views}</span>
                    <span>📋 {item.copies}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sidebar-footer">
        <p className="version-text">v2.0 Premium AI</p>
      </div>
    </aside>
  </>
)

function App() {
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
      <Sidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        sidebarLoading={sidebarLoading} 
        documents={documents} 
        trending={trending} 
        setInput={setInput} 
      />
      
      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <button className="sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? '❮' : '☰'}
            </button>
            <div className="header-content">
              <h1>Casas Bahia RAG</h1>
              <p>Multimodal Agent</p>
            </div>
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
