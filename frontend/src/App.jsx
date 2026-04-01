import React, { useState, useRef, useEffect } from 'react'
import './index.css'

// URL base da API — Vite proxy redireciona /api no dev, Vercel serverless em produção
const API_BASE = ''

const getStatKey = (text) => {
  if (!text) return 'p-empty'
  const clean = text.trim()
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
  const slug = parts.slice(2).join('-')
  const readable = slug.replace(/_/g, ' ')
  return readable.charAt(0).toUpperCase() + readable.slice(1)
}

const PromptCodeBlock = ({ inner, blockKey, isWordWrap, setIsWordWrap, copyToClipboard, shareToTeams, copiedIdx, updateStat }) => {
  const [stats, setStats] = useState({ views: 0, copies: 0, shares: 0 })
  const lines = inner.trim().split('\n')
  const key = getStatKey(inner.trim())

  useEffect(() => {
    fetch(`${API_BASE}/api/stats/${key}`)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Erro ao buscar stats:', err))

    updateStat(inner.trim(), 'views')
      .then(data => {
        if (data) setStats(data)
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
            onClick={async () => {
              const newStats = await updateStat(inner.trim(), 'shares')
              if (newStats) setStats(newStats)
              shareToTeams(inner.trim())
            }}
            title="Compartilhar no Microsoft Teams"
          >
            Teams
          </button>
          <button
            className={`copy-btn ${copiedIdx[blockKey] ? 'copied' : ''}`}
            onClick={async () => {
              const newStats = await updateStat(inner.trim(), 'copies')
              if (newStats) setStats(newStats)
              copyToClipboard(inner.trim(), blockKey)
            }}
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

const Sidebar = ({ isSidebarOpen, setIsSidebarOpen, sidebarLoading, documents, trending, setInput, onFileUpload, isUploading, onDeleteClick }) => (
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
      
      <div className="upload-section">
        <label className={`upload-card ${isUploading ? 'uploading' : ''}`}>
          <input 
            type="file" 
            style={{ display: 'none' }} 
            onChange={(e) => {
              if (e.target.files?.[0]) onFileUpload(e.target.files[0])
            }}
            disabled={isUploading}
            accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.webm"
          />
          <span className="upload-icon">{isUploading ? '⚙️' : '📁'}</span>
          <span className="upload-text">
            {isUploading ? 'Processando...' : 'Adicionar Conteúdo'}
          </span>
          <span className="upload-hint">PDF, Imagens ou Vídeos</span>
          <div className="upload-progress-bar"></div>
        </label>
        
        {isUploading && (
          <div className="upload-status-msg">
            <div className="spinner-sm"></div>
            <span>Indexando no Pinecone...</span>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <h2 className="section-label">📂 Documentos ({documents.length})</h2>
        <ul className="document-list">
          {sidebarLoading ? (
            <div className="loading-spinner-small"></div>
          ) : documents.length > 0 ? (
            documents.map((doc, idx) => (
              <li key={idx} className="document-item" title={doc.name} onClick={() => setInput(prev => `${prev} Analise o documento ${doc.name}`.trim())}>
                <span className="doc-icon">
                  {['png', 'jpg', 'jpeg'].includes(doc.type) ? '🖼️' : 
                   ['mp4', 'mov', 'webm'].includes(doc.type) ? '🎬' : '📄'}
                </span>
                <div className="doc-info">
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">{doc.type}</div>
                </div>
                <button 
                  className="delete-doc-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(doc.path);
                  }}
                  title="Remover documento"
                >
                  🗑️
                </button>
              </li>
            ))
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '1rem' }}>
              Nenhum documento indexado.
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
                onClick={() => setInput(beautifyPromptId(item.prompt_id))}
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
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Olá! Sou seu assistente RAG Multimodal. Pergunte-me qualquer coisa sobre seus documentos, imagens ou vídeos.' }
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState(null)
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('rag-settings')
    return saved ? JSON.parse(saved) : {
      apiKey: '',
      model: 'gemini-3-flash-preview'
    }
  })
  
  const [lastQuery, setLastQuery] = useState('')
  const [documents, setDocuments] = useState([])
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024)
  const [isWordWrap, setIsWordWrap] = useState(true)
  const [trending, setTrending] = useState([])
  const [isBackendOnline, setIsBackendOnline] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api`)
        if (response.ok) {
          setIsBackendOnline(true)
          return true
        }
      } catch (err) {
        setIsBackendOnline(false)
        return false
      }
      return false
    }

    // Primeiro check de status antes de buscar dados
    const initialCheck = async () => {
      const isOnline = await checkStatus()
      if (isOnline) {
        fetchDocuments()
        fetchTrending()
      } else {
        // Se ainda não estiver online, espera e tenta de novo em 3s
        setTimeout(initialCheck, 3000)
      }
    }

    // Pequeno delay inicial para evitar pings antes do backend estar minimamente pronto
    const startAfterDelay = async () => {
      await new Promise(r => setTimeout(r, 2000))
      initialCheck()
    }

    startAfterDelay()
    
    // Intervalos regulares
    const docInterval = setInterval(() => { if (isBackendOnline) fetchDocuments() }, 60000)
    const trendingInterval = setInterval(() => { if (isBackendOnline) fetchTrending() }, 30000)
    const statusInterval = setInterval(checkStatus, 5000)
    
    return () => {
      clearInterval(docInterval)
      clearInterval(trendingInterval)
      clearInterval(statusInterval)
    }
  }, [])

  const fetchTrending = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stats/trending`)
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json()
        setTrending(data)
        setIsBackendOnline(true)
      }
    } catch (err) { 
      console.error('Erro ao buscar trending:', err)
      setIsBackendOnline(false)
    }
  }

  const fetchDocuments = async () => {
    setSidebarLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/documents`)
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json()
        setDocuments(data)
        setIsBackendOnline(true)
      }
    } catch (err) { 
      console.error('Erro ao carregar documentos:', err)
      setIsBackendOnline(false)
    } finally { 
      setSidebarLoading(false) 
    }
  }

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    try {
      const resp = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(docToDelete)}`, { method: 'DELETE' });
      if (resp.ok) {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          content: `🗑️ Documento **"${docToDelete}"** removido com sucesso de todas as bases.` 
        }]);
        fetchDocuments();
      } else {
        throw new Error('Falha ao deletar no servidor');
      }
    } catch (err) {
      alert("Erro ao deletar documento: " + err.message);
    } finally {
      setIsDeleteModalOpen(false);
      setDocToDelete(null);
    }
  };

  const handleFileUpload = async (file) => {
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Falha no upload')
      }
      setMessages(prev => [...prev, { 
        role: "ai",
        content: `✅ Arquivo **"${file.name}"** indexado com sucesso na base vetorial!` 
      }])
      fetchDocuments()
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: "ai",
        content: `❌ Erro ao processar arquivo: ${err.message}` 
      }])
    } finally {
      setIsUploading(false)
    }
  }

  const [copiedIdx, setCopiedIdx] = useState({})
  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCopiedIdx(prev => ({ ...prev, [key]: false })), 2000)
    })
  }

  const shareToTeams = (text) => {
    window.open(`https://teams.microsoft.com/share?msgText=${encodeURIComponent(text)}`, '_blank')
  }

  const updateStat = async (text, type) => {
    try {
      const response = await fetch(`${API_BASE}/api/stats/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: getStatKey(text), type })
      })
      const result = await response.json()
      fetchTrending()
      return result
    } catch (err) { return false }
  }

  const renderMarkdown = (text) => {
    if (!text) return null
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const inner = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim()
        return (
          <PromptCodeBlock 
            inner={inner} 
            blockKey={`code-${i}`} 
            isWordWrap={isWordWrap}
            setIsWordWrap={setIsWordWrap}
            copyToClipboard={copyToClipboard}
            shareToTeams={shareToTeams}
            copiedIdx={copiedIdx}
            updateStat={updateStat}
          />
        )
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
      if (!response.ok) throw new Error('Erro ao processar solicitação.')
      const data = await response.json()
      setMessages(prev => [...prev, { role: 'ai', content: data.answer, results: data.sources }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: `❌ Erro: ${error.message}` }])
    } finally { setIsLoading(false) }
  }

  const renderHighlightedText = (text, query) => {
    if (!query.trim() || !text) return text;
    const terms = query.trim().split(/\s+/).filter(t => t.length > 1);
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escapedTerms.length === 0) return text;
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    return text.split(regex).map((part, i) => regex.test(part) ? <mark key={i} className="highlight-text">{part}</mark> : part);
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
        onFileUpload={handleFileUpload}
        isUploading={isUploading}
        onDeleteClick={(name) => { setDocToDelete(name); setIsDeleteModalOpen(true); }}
      />
      
      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <button className="sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? '❮' : '☰'}
            </button>
            <div className="header-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1>Casas Bahia RAG</h1>
              <div 
                className={`status-indicator ${isBackendOnline ? 'online' : 'offline'}`}
                title={isBackendOnline ? 'Servidor Online' : 'Servidor Offline'}
              ></div>
            </div>
            <p>Multimodal Agent {!isBackendOnline && <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>(OFFLINE)</span>}</p>
          </div>
          </div>
          <button className="settings-toggle" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
        </header>

        <section className="chat-window">
          {messages.map((m, idx) => (
            <div key={idx} className={`message ${m.role}`}>
              <div className="message-content">{renderMarkdown(m.content)}</div>
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
              <div className="loader"><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
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

      {/* Modals */}
      {selectedResult && (
        <div className="modal-overlay" onClick={() => setSelectedResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedResult(null)}>✕</button>
            <h2 className="modal-title">{selectedResult.metadata.source?.split('\\').pop() || 'Detalhes'}</h2>
            <div className="modal-body">{renderHighlightedText(selectedResult.metadata.text_content, lastQuery)}</div>
            <div className="modal-meta">
              <span>Tipo: {selectedResult.metadata.type}</span>
              <span>Score: {(selectedResult.score * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsSettingsOpen(false)}>✕</button>
            <h2 className="modal-title">Configurações Gemini</h2>
            <div className="settings-group">
              <label>API Key:</label>
              <input type="password" value={settings.apiKey} onChange={(e) => setSettings({...settings, apiKey: e.target.value})} placeholder="Opcional..." />
            </div>
            <div className="settings-group">
              <label>Modelo:</label>
              <select value={settings.model} onChange={(e) => setSettings({...settings, model: e.target.value})}>
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </select>
            </div>
            <button className="save-btn" onClick={() => setIsSettingsOpen(false)}>Salvar</button>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" style={{ color: '#f43f5e' }}>Confirmar Exclusão</h2>
            <p style={{ margin: '1rem 0' }}>Deseja remover permanentemente <strong>{docToDelete}</strong>? A base de vetores será limpa.</p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="save-btn" style={{ flex: 1, background: '#334155' }} onClick={() => setIsDeleteModalOpen(false)}>Cancelar</button>
              <button className="save-btn" style={{ flex: 1, background: '#f43f5e' }} onClick={handleDeleteDocument}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
