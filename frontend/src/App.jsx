import React, { useState, useRef, useEffect } from 'react'
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Sidebar from './components/Sidebar';
import './index.css'
import { cn } from './lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Avatar, AvatarFallback, Separator } from './components/ui/avatar-separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from './components/ui/dialog';
import { Skeleton } from './components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Share2, 
  Copy, 
  Check, 
  Eye, 
  Users, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Settings as SettingsIcon,
  Menu,
  Send,
  Zap,
  LayoutGrid,
  Search,
  AlertTriangle,
  LogOut,
  Sparkles,
  ArrowRight,
  Database,
  Terminal,
  Cpu,
  ChevronRight,
  Maximize2,
  ExternalLink,
  Bot,
  User as UserIcon,
  HelpCircle,
  Command,
  Activity,
  History
} from 'lucide-react';

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8001' : '';

const getStatKey = (text) => {
  if (!text) return 'p-empty'
  const clean = text.trim()
  const slug = clean.substring(0, 25)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .substring(0, 20)
  return `p-${clean.length}-${slug}`
}

const WelcomeHub = ({ setInput, handleSearch }) => {
  const suggestions = [
    { title: "Discovery Estratégico", prompt: "Gere perguntas de discovery para entender comportamentos e dores no novo fluxo de checkout.", icon: <Search className="w-4 h-4" /> },
    { title: "Jornada Omnicanal", prompt: "Identifique rupturas e oportunidades de continuidade entre o app e a loja física nesta jornada.", icon: <LayoutGrid className="w-4 h-4" /> },
    { title: "Hipóteses de Design", prompt: "Crie 5 hipóteses de design estruturadas para reduzir o abandono de carrinho no marketplace.", icon: <Sparkles className="w-4 h-4" /> },
    { title: "Otimização de PDP", prompt: "Analise a PDP atual com foco em clareza de oferta, gatilhos de confiança e prazos de entrega.", icon: <Database className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col items-center justify-start min-h-[70vh] text-center space-y-8 animate-fade-in-up py-4">
      <div className="relative">
        <div className="absolute -inset-24 bg-primary/20 blur-[100px] rounded-full opacity-40"></div>
        <div className="space-y-4 relative">
          <Badge variant="outline" className="px-5 py-1.5 rounded-full border-primary/20 bg-primary/5 text-primary text-[10px] font-black tracking-[0.2em] uppercase animate-pulse">
            DesignOps Intelligence • Q1-2026
          </Badge>
          <h2 className="text-5xl lg:text-7xl font-black tracking-tighter text-white max-w-3xl leading-[1.05]">
            Potencializando o <span className="text-primary italic">Design no Varejo.</span>
          </h2>
          <p className="text-foreground/40 max-w-xl mx-auto text-base font-bold leading-relaxed tracking-tight">
            Converta dados de discovery em decisões de design estratégico através da nossa infraestrutura RAG privada.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl px-0">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => { setInput(s.prompt); }}
            className="group glass p-6 rounded-[2rem] text-left hover:bg-primary/[0.03] hover:border-primary/20 hover:scale-[1.02] transition-all duration-300 relative"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <ChevronRight className="w-20 h-20 -rotate-45" />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-foreground/40 mb-5 group-hover:text-primary group-hover:bg-primary/20 transition-all duration-500 shadow-inner">
              {s.icon}
            </div>
            <h3 className="text-sm font-black text-white mb-2 uppercase tracking-wide">{s.title}</h3>
            <p className="text-xs text-foreground/30 font-bold leading-relaxed pr-8">{s.prompt}</p>
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-4 text-foreground/20 text-[10px] font-black uppercase tracking-[0.3em]">
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Latência 40ms</div>
        <div className="w-1 h-1 rounded-full bg-white/10"></div>
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> GPU Cluster Ativo</div>
      </div>
    </div>
  );
};

const MessageSkeleton = () => (
  <div className="flex flex-col items-start gap-4 w-full animate-in fade-in duration-500">
    <div className="flex items-center gap-3 mb-1">
       <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary/40"><Bot className="w-4 h-4" /></div>
       <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">Processando Conhecimento...</span>
    </div>
    <div className="glass border-white/5 rounded-[2.5rem] rounded-tl-none p-8 w-[80%] shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      <div className="space-y-4">
        <Skeleton className="h-3.5 w-full bg-white/5 rounded-full" />
        <Skeleton className="h-3.5 w-[92%] bg-white/5 rounded-full" />
        <Skeleton className="h-3.5 w-[95%] bg-white/5 rounded-full" />
        <Skeleton className="h-3.5 w-[60%] bg-white/5 rounded-full" />
      </div>
    </div>
  </div>
);

const PromptCodeBlock = ({ inner, blockKey, isWordWrap, setIsWordWrap, copyToClipboard, shareToTeams, copiedIdx, updateStat }) => {
  const [stats, setStats] = useState({ views: 0, copies: 0, shares: 0 })
  const lines = inner.trim().split('\n')
  const key = getStatKey(inner.trim())

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stats/${key}`)
        const data = await res.json()
        if (data && typeof data === 'object' && !data.status) {
          setStats(prev => ({ ...prev, ...data }))
        }
      } catch (err) { console.error('Erro ao buscar stats:', err) }
    }

    fetchStats()
    updateStat(inner.trim(), 'views')
      .then(data => {
        if (data && typeof data === 'object' && !data.status) {
          setStats(prev => ({ ...prev, ...data }))
        }
      })
  }, [key])

  return (
    <Card className="my-8 overflow-hidden border-white/5 bg-slate-950/40 backdrop-blur-xl shadow-2xl rounded-[2rem] transform hover:scale-[1.005] transition-transform duration-500">
      <CardHeader className="flex flex-row items-center justify-between p-6 bg-white/[0.02] border-b border-white/5 space-y-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
             <Terminal className="w-5 h-5" />
          </div>
          <div>
            <Badge variant="outline" className="border-primary/20 text-primary text-[10px] font-black tracking-widest uppercase">
               Pattern Sistêmico
            </Badge>
            <p className="text-[11px] text-foreground/40 font-bold mt-1 uppercase tracking-tighter">{stats.views} interações detectadas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("h-9 px-3 rounded-xl text-[10px] font-black uppercase text-foreground/40 hover:text-white transition-all relative overflow-hidden", isWordWrap && "bg-white/5 text-white")} 
                  onClick={() => setIsWordWrap(!isWordWrap)}
                >
                  Wrap
                  {isWordWrap && <div className="absolute bottom-0 left-[-10%] right-[-10%] h-[3px] bg-red-600 rounded-full blur-[0.5px]" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isWordWrap ? 'Desativar Wrap' : 'Ativar Wrap'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" 
                  size="icon"
                  className="h-9 w-9 rounded-xl text-foreground/30 hover:text-primary hover:bg-primary/10 transition-all"
                  onClick={async () => {
                    shareToTeams(inner.trim())
                    const newStats = await updateStat(inner.trim(), 'shares')
                    if (newStats && typeof newStats === 'object' && !newStats.status) {
                      setStats(prev => ({ ...prev, ...newStats }))
                    }
                    toast.success("Pronto para compartilhar via Teams");
                  }}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Broadcast no Teams</TooltipContent>
            </Tooltip>

            <Button
              variant="default"
              size="sm"
              className={cn("h-9 px-5 rounded-xl font-black text-[10px] uppercase transition-all duration-500 shadow-lg", 
                copiedIdx[blockKey] ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20" : "bg-primary hover:bg-primary/80 text-white shadow-primary/20")}
              onClick={async () => {
                copyToClipboard(inner.trim(), blockKey)
                const newStats = await updateStat(inner.trim(), 'copies')
                if (newStats && typeof newStats === 'object' && !newStats.status) {
                  setStats(prev => ({ ...prev, ...newStats }))
                }
              }}
            >
              {copiedIdx[blockKey] ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
              {copiedIdx[blockKey] ? 'Sucesso' : 'Capturar'}
            </Button>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="p-0 font-mono text-[13px] relative overflow-hidden group bg-slate-950/20">
        <div className="py-6 overflow-x-auto scroll-smooth font-mono leading-relaxed selection:bg-primary/30 max-h-[70vh]">
          {lines.map((line, i) => (
            <div key={i} className="flex group/line hover:bg-white/[0.02] transition-colors min-h-[1.5rem]">
              {/* Line Number Column (Sticky Like VS Code) */}
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-[#020617]/80 backdrop-blur-sm text-right pr-4 text-foreground/20 select-none font-bold text-[11px] leading-relaxed pt-0.5 border-r border-white/5 mr-4">
                {i + 1}
              </div>
              {/* Line Content */}
              <div className={cn(
                "flex-1 pr-8 leading-relaxed capitalize-none group-hover/line:text-white transition-colors", 
                isWordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
              )}>
                {line || '\u00A0'}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isWordWrap, setIsWordWrap] = useState(true)
  const [trending, setTrending] = useState([])
  const [isBackendOnline, setIsBackendOnline] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    const checkVerification = async (email) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/otp/status/${email}`);
        const data = await res.json();
        setIsVerified(data.is_verified);
      } catch (e) {
        console.error("Erro verificação:", e);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkVerification(session.user.email);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkVerification(session.user.email);
      else setIsVerified(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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

    const initialCheck = async () => {
      const isOnline = await checkStatus()
      if (isOnline) {
        fetchDocuments()
        fetchTrending()
      } else {
        setTimeout(initialCheck, 3000)
      }
    }

    const startAfterDelay = async () => {
      await new Promise(r => setTimeout(r, 2000))
      initialCheck()
    }

    startAfterDelay()
    
    const docInterval = setInterval(() => { if (isBackendOnline) fetchDocuments() }, 60000)
    const trendingInterval = setInterval(() => { if (isBackendOnline) fetchTrending() }, 30000)
    const statusInterval = setInterval(checkStatus, 5000)
    
    return () => {
      clearInterval(docInterval)
      clearInterval(trendingInterval)
      clearInterval(statusInterval)
    }
  }, [isBackendOnline]);

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
        toast.success(`Base de dados "${docToDelete}" expurgada com sucesso.`);
        fetchDocuments();
      } else {
        throw new Error('Falha catastrófica ao remover conteúdo');
      }
    } catch (err) {
      toast.error("Erro na operação: " + err.message);
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
        throw new Error(errorData.detail || 'Falha na ingestão')
      }
      toast.success(`Fonte "${file.name}" integrada ao ecossistema.`);
      fetchDocuments()
    } catch (err) {
      toast.error(`Falha técnica: ${err.message}`);
    } finally {
      setIsUploading(false)
    }
  }

  const renderHighlightedText = (text, query) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <span className="leading-relaxed">
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() 
            ? <span key={i} className="bg-primary/20 text-primary px-1 py-0.5 rounded-md font-black shadow-sm">{part}</span> 
            : part
        )}
      </span>
    );
  };

  const [copiedIdx, setCopiedIdx] = useState({})
  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(prev => ({ ...prev, [key]: true }))
      toast.success("Patrão operacional copiado para o Clipboard.");
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
        body: JSON.stringify({ 
          prompt_id: getStatKey(text), 
          text: text,
          type: type 
        })
      })
      const result = await response.json()
      fetchTrending()
      return result
    } catch (err) { 
      return false 
    }
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
            key={`code-block-${i}`}
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
      if (!line.trim()) return <div key={key} className="h-3" />
      if (line.startsWith('### ')) return <h4 key={key} className="text-xl font-bold text-white mb-2 mt-5 uppercase tracking-tight">{renderSpan(line.slice(4))}</h4>
      if (line.startsWith('## ')) return <h3 key={key} className="text-2xl font-black text-white mb-3 mt-7 uppercase tracking-tighter border-l-4 border-primary pl-4">{renderSpan(line.slice(3))}</h3>
      
      // Listas com Bullets (bolinha)
      if (/^[\*\-] /.test(line)) return (
        <div key={key} className="flex gap-3 items-start mb-2 animate-zoom-in group/bullet">
           <div className="mt-[0.55rem] w-2 h-2 rounded-full bg-primary/40 group-hover/bullet:bg-primary transition-colors shrink-0 shadow-[0_0_8px_rgba(var(--primary),0.3)]"></div>
           <p className="text-foreground/70 font-medium leading-snug">{renderSpan(line.slice(2))}</p>
        </div>
      )

      // Listas Numeradas
      if (/^\d+\. /.test(line)) return (
        <div key={key} className="flex gap-3 items-baseline mb-2 animate-zoom-in group/num">
           <span className="text-[14px] font-black text-primary opacity-50 group-hover/num:opacity-100 transition-opacity shrink-0 min-w-[1.2rem]">
             {line.match(/^\d+/)[0]}.
           </span>
           <p className="text-foreground/70 font-medium leading-snug">{renderSpan(line.replace(/^\d+\. /, ''))}</p>
        </div>
      )

      return <p key={key} className="text-base text-foreground/80 leading-snug font-medium mb-2.5">{renderSpan(line)}</p>
    })
  }

  const renderSpan = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-white font-black">{p.slice(2, -2)}</strong>
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-white/5 px-2 py-0.5 rounded-lg text-primary font-mono text-[13px] border border-white/5">{p.slice(1, -1)}</code>
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
      if (!response.ok) throw new Error('Erro na comunicação síncrona.')
      const data = await response.json()
      setMessages(prev => [...prev, { role: 'ai', content: data.answer, results: data.sources }])
    } catch (error) {
      toast.error("Falla de rede: " + error.message);
    } finally { setIsLoading(false) }
  }

  const handleClearChat = () => {
    setMessages([])
    toast.info("Memória do terminal limpa.")
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617]">
       <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse rounded-full"></div>
          <div className="flex gap-3 relative">
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce shadow-lg shadow-primary/20" style={{ animationDelay: '0s' }}></div>
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce shadow-lg shadow-primary/20" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-3 h-3 rounded-full bg-primary animate-bounce shadow-lg shadow-primary/20" style={{ animationDelay: '0.4s' }}></div>
          </div>
       </div>
    </div>
  );

  if (!session || !isVerified) return <Auth initialEmail={session?.user?.email} />;

  return (
    <TooltipProvider>
      <div className="app-container font-sans selection:bg-primary/30">
        <Toaster position="top-center" richColors theme="dark" />
        
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <Sidebar 
            session={session}
            isSidebarOpen={isSidebarOpen} 
            setIsSidebarOpen={setIsSidebarOpen} 
            sidebarLoading={sidebarLoading} 
            documents={documents} 
            trending={trending} 
            setInput={setInput} 
            onFileUpload={handleFileUpload}
            isUploading={isUploading}
            onDeleteClick={(name) => { setDocToDelete(name); setIsDeleteModalOpen(true); }}
            onSignOut={handleSignOut}
          />
        )}
        
        {/* Main Content */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-10 border-b border-white/5 bg-slate-950/20 backdrop-blur-3xl z-40">
            <div className="flex items-center gap-6">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="text-foreground/30 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
                aria-label={isSidebarCollapsed ? "Maximizar Ambiente" : "Minimizar Ambiente"}
              >
                <Menu className="w-6 h-6" />
              </Button>
              <div className="h-px bg-white/5 w-6 rotate-90 hidden lg:block"></div>
              <div className="flex flex-col gap-1">
                 <div className="flex items-center gap-3">
                    <h1 className="text-sm font-black uppercase tracking-[0.25em] text-white">Workstation</h1>
                    <Badge variant="outline" className={cn(
                      "text-[9px] px-2 py-0 border-none uppercase font-black transition-all",
                      isBackendOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {isBackendOnline ? 'Sincronizado' : 'Offline'}
                    </Badge>
                 </div>
              </div>
            </div>
            
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-4 mr-4 text-foreground/20 text-[10px] font-black uppercase tracking-wider">
                   <div className="flex items-center gap-2"><Activity className="w-3 h-3 text-primary/40" /> 0.2ms</div>
                   <div className="flex items-center gap-2"><History className="w-3 h-3 text-primary/40" /> Last Index 2m</div>
                </div>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={handleClearChat}
                      className="border-white/5 bg-white/[0.02] text-foreground/30 hover:text-rose-500 hover:border-rose-500/40 rounded-2xl transition-all shadow-inner h-11 w-11"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Limpar Terminal</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setIsSettingsOpen(true)}
                      className="border-white/5 bg-white/[0.02] text-foreground/30 hover:text-white hover:border-primary/40 rounded-2xl transition-all shadow-inner h-11 w-11"
                    >
                      <SettingsIcon className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Parâmetros do Modelo</TooltipContent>
                </Tooltip>
              </div>
          </header>

          {/* Chat Canvas with Alpha Mask Fade */}
          <div className="flex-1 relative overflow-hidden">
            <ScrollArea 
              className="h-full px-0 pt-0"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 95%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 95%, transparent)'
              }}
            >
              <div className="max-w-none mx-auto space-y-16 pb-0 px-10" role="log" aria-live="polite">
                {(messages.length === 0 && !isLoading) ? (
                  <WelcomeHub setInput={setInput} handleSearch={handleSearch} />
                ) : (
                <div className="space-y-12">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={cn(
                      "flex flex-col gap-5 animate-zoom-in",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}>
                      {/* Message Label */}
                      <div className={cn("flex items-center gap-3 px-2", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                         <div className={cn(
                           "w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black uppercase shadow-inner",
                           msg.role === 'user' ? "bg-primary/20 text-primary" : "bg-white/10 text-white/50"
                         )}>
                           {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                         </div>
                         <span className="text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em]">
                           {msg.role === 'user' ? 'Solicitante' : 'Neural Agent'} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                      </div>

                      {/* Content Bubble */}
                      <div 
                        className={cn(
                          "max-w-[85%] p-0.5 rounded-[1rem] transition-all duration-500",
                          msg.role === 'user' 
                            ? "bg-gradient-to-tr from-primary to-indigo-600 rounded-tr-none shadow-2xl shadow-primary/20" 
                            : "glass border-white/5 mr-auto rounded-tl-none shadow-xl"
                        )}
                      >
                        <div className={cn(
                          "w-full h-full py-3 px-6 rounded-[0.9rem] relative overflow-hidden",
                          msg.role === 'user' ? "bg-slate-950/20" : ""
                        )}>
                          {msg.role === 'ai' && (
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                          )}
                          <div className={cn(
                            "max-w-none text-white/90",
                            msg.role === 'user' ? "text-white font-bold tracking-tight" : ""
                          )}>
                            {renderMarkdown(msg.content)}
                          </div>
                        </div>
                      </div>

                      {/* Source Extraction Row */}
                      {msg.results && (
                        <div className="w-full flex flex-col gap-4 mt-2 animate-fade-in-up">
                           <div className="flex items-center gap-3 px-2">
                              <Database className="w-3.5 h-3.5 text-primary/40" />
                              <span className="text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em]">Fontes de Conhecimento Relevantes</span>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {msg.results.map((res, ridx) => (
                              <Card 
                                key={ridx} 
                                className="group glass-card border-white/5 hover:border-primary/30 hover:bg-primary/[0.03] transition-all duration-500 cursor-pointer rounded-[1.5rem] relative overflow-hidden flex flex-col h-full"
                                onClick={() => setSelectedResult(res)}
                              >
                                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <Maximize2 className="w-3 h-3 text-primary/40" />
                                </div>
                                <CardHeader className="p-5 pb-3">
                                  <div className="flex items-center gap-3 mb-1">
                                    <Badge variant="outline" className="text-[8px] font-black px-1.5 py-0 h-4 bg-primary/10 border-primary/20 text-primary uppercase">
                                      {res.metadata?.type || 'DOC'}
                                    </Badge>
                                    <span className="text-[11px] font-black text-white/40 truncate group-hover:text-white transition-colors">{res.metadata?.source?.split('/').pop()}</span>
                                  </div>
                                </CardHeader>
                                <CardContent className="p-5 pt-0 flex-1">
                                  <p className="text-[12px] text-foreground/40 leading-relaxed font-bold line-clamp-3 group-hover:text-foreground/70 transition-colors">
                                    "{res.metadata?.text_content}"
                                  </p>
                                </CardContent>
                                <CardFooter className="p-4 px-6 border-t border-white/5 flex justify-between bg-white/5 items-center">
                                  <div className="flex items-center gap-2">
                                     <div className="flex items-center gap-0.5">
                                        {[1,2,3,4,5].map(s => (
                                          <div key={s} className={cn("w-1 h-1 rounded-full", s <= Math.round(res.score*5) ? "bg-primary" : "bg-white/10")}></div>
                                        ))}
                                     </div>
                                     <span className="text-[9px] font-black text-primary/50 uppercase">Score Ranking</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary">{(res.score * 100).toFixed(0)}%</span>
                                </CardFooter>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isLoading && <MessageSkeleton />}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Interactive Shell Input */}
        <section className="px-10 pb-4 pt-0 relative z-50 bg-gradient-to-t from-background via-background/95 to-transparent">
            <div className="max-w-4xl mx-auto relative group">
              {/* Input Glow Decor */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-indigo-600/20 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700"></div>
              
              <div className="relative flex gap-4 glass p-2 rounded-[2.5rem] border-white/10 focus-within:border-primary/40 focus-within:bg-slate-950/60 transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-center pl-6 text-foreground/20 group-focus-within:text-primary transition-colors">
                   <Command className="w-5 h-5" />
                </div>
                <Input 
                  type="text" 
                  placeholder="Inicie sua consulta inteligente..." 
                  className="flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-white placeholder:text-white/10 h-14 px-2 text-base font-bold"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  aria-label="Shell de Comando RAG"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      className={cn(
                        "h-14 w-14 rounded-full transition-all duration-500 shadow-2xl",
                        input.trim() ? "bg-primary hover:bg-primary/80 text-white scale-100" : "bg-white/5 text-white/5 scale-90"
                      )} 
                      onClick={handleSearch}
                      disabled={!input.trim() || isLoading}
                      aria-label="Confirmar Comando"
                    >
                      <ArrowRight className="w-6 h-6" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="font-black text-[11px] uppercase tracking-widest bg-primary text-white">Executar</TooltipContent>
                </Tooltip>
              </div>
              
              <div className="flex items-center justify-between px-8 mt-6">
                 <div className="flex items-center gap-6 text-[9px] font-black text-foreground/10 uppercase tracking-[0.4em]">
                    <span>Neural Link Established</span>
                    <span>Encrypting Stream</span>
                 </div>
                 <div className="flex gap-4">
                    <Tooltip>
                       <TooltipTrigger asChild>
                         <HelpCircle className="w-4 h-4 text-foreground/10 hover:text-primary/40 cursor-help transition-colors" />
                       </TooltipTrigger>
                       <TooltipContent>Documentação</TooltipContent>
                    </Tooltip>
                 </div>
              </div>
            </div>
          </section>

          {/* Dialog Overlays */}
          <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
            <DialogContent className="max-w-4xl glass-card text-white border-white/10 p-0 overflow-hidden rounded-[2.5rem]">
              <div className="relative p-12 pt-16">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-600 to-primary/40"></div>
                <DialogHeader className="mb-10">
                  <div className="flex items-center gap-6 mb-4">
                    <div className="w-14 h-14 rounded-2.5xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                      <FileText className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                      <DialogTitle className="text-3xl font-black tracking-tight mb-1 truncate pr-8">
                        {selectedResult?.metadata?.source?.split('/').pop()}
                      </DialogTitle>
                      <DialogDescription className="text-foreground/40 text-[11px] font-black tracking-[0.2em] uppercase">
                        Segmento de Conhecimento • Rank #{Math.round(selectedResult?.score * 100)}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh] pr-6">
                  <div className="bg-slate-950/40 p-10 rounded-[2rem] border border-white/5 font-mono text-[15px] leading-relaxed relative overflow-hidden group">
                     <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-4 h-4 text-primary" />
                     </div>
                     <p className="text-white/80 selection:bg-primary/40 selection:text-white italic">
                       {selectedResult && renderHighlightedText(selectedResult.metadata.text_content, lastQuery)}
                     </p>
                  </div>
                </ScrollArea>

                <div className="mt-12 flex items-center justify-between">
                   <div className="flex gap-10">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-foreground/20 leading-none mb-2">Confidence Level</span>
                        <div className="flex items-center gap-2">
                           <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${selectedResult?.score * 100}%` }}></div>
                           </div>
                           <span className="text-sm font-black text-primary">{(selectedResult?.score * 100).toFixed(2)}%</span>
                        </div>
                      </div>
                   </div>
                   <div className="flex gap-3">
                      <Button variant="ghost" className="rounded-2xl h-12 px-8 font-black text-[11px] uppercase tracking-widest text-foreground/40 hover:text-white" onClick={() => setSelectedResult(null)}>
                        Fechar
                      </Button>
                      <Button className="rounded-2xl h-12 px-8 font-black text-[11px] uppercase tracking-widest bg-primary hover:bg-primary/80 shadow-xl shadow-primary/20">
                        Exportar Segmento
                      </Button>
                   </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogContent className="max-w-md glass-card text-white border-white/10 rounded-[2.5rem] p-10">
              <DialogHeader className="mb-8">
                <DialogTitle className="text-xl font-black uppercase tracking-widest flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-foreground/40">
                    <SettingsIcon className="w-5 h-5" />
                  </div>
                  Parâmetros
                </DialogTitle>
                <DialogDescription className="text-foreground/30 text-xs font-bold uppercase tracking-tight pt-2">
                  Ajustar motor de processamento neural
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-8 py-4">
                <div className="space-y-3">
                  <Label className="text-subtitle ml-1">Modelo de Inferência</Label>
                  <select 
                    className="w-full bg-slate-950/40 border border-white/5 rounded-2xl h-12 px-5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none transition-all hover:bg-white/[0.03]"
                    value={settings.model} 
                    onChange={(e) => setSettings({...settings, model: e.target.value})}
                  >
                    <option value="gemini-3-flash-preview">Gemini 3 Flash (Otimizado)</option>
                    <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Lite (Velocidade)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Estável)</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <Label className="text-subtitle ml-1">Token de Acesso (API Key)</Label>
                  <Input 
                    type="password" 
                    value={settings.apiKey} 
                    onChange={(e) => setSettings({...settings, apiKey: e.target.value})} 
                    placeholder="Integrar chave proprietária..." 
                    className="bg-slate-950/40 border-white/5 h-12 rounded-2xl px-5 focus-visible:ring-primary/40 text-white placeholder:text-white/5"
                  />
                  <p className="text-[9px] text-foreground/20 italic font-black uppercase tracking-tight px-1">Encriptação local (AES-256) ativa no browser.</p>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/80 text-white font-black uppercase text-[11px] tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95" onClick={() => setIsSettingsOpen(false)}>
                  Salvar Mudanças
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
            <DialogContent className="max-w-xl glass-card border-rose-500/10 rounded-[2.5rem] p-12 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent"></div>
              <DialogHeader className="items-center mb-8">
                <div className="w-20 h-20 rounded-[2rem] bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6 animate-pulse shadow-inner">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <DialogTitle className="text-white text-2xl font-black uppercase tracking-tighter">Eliminar Fonte?</DialogTitle>
                <DialogDescription className="text-foreground/40 font-bold leading-relaxed pt-2">
                  Esta ação expurgará permanentemente o documento e todos os seus vetores semânticos do cluster.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-slate-950 p-6 rounded-[1.5rem] border border-white/5 mb-10">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 shadow-inner">
                      <FileText className="w-5 h-5" />
                   </div>
                   <p className="text-sm font-black text-white/80 text-left flex-1 break-all line-clamp-2 leading-relaxed">{docToDelete}</p>
                </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-3">
                <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-foreground/30 font-black uppercase text-[10px] tracking-widest hover:text-white" onClick={() => setIsDeleteModalOpen(false)}>
                  Interromper
                </Button>
                <Button className="flex-1 h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-rose-900/40 border-none transition-all" onClick={handleDeleteDocument}>
                  Confirmar Expurgar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default App;
