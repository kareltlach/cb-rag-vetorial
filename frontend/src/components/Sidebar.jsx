import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient';
import {
  Trash2,
  Share2,
  Copy,
  Eye,
  Users,
  FileText,
  Sparkles,
  Search,
  Zap,
  LayoutGrid,
  History,
  Archive,
  CloudUpload,
  Plus,
  LogOut
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8001' : '';

export default function Sidebar({ documents, trending, sidebarLoading, onDeleteClick, setInput, session, onSignOut }) {
  const [isUploading, setIsUploading] = useState(false);

  const getDocIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'pdf': return <FileText className="w-5 h-5 text-rose-400" />;
      case 'image': return <LayoutGrid className="w-5 h-5 text-emerald-400" />;
      case 'video': return <Zap className="w-5 h-5 text-amber-400" />;
      default: return <FileText className="w-5 h-5 text-primary" />;
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 4.5 * 1024 * 1024) {
      toast.error("O arquivo excede o limite de 4.5MB para processamento em nuvem.");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        toast.success(`Documento "${file.name}" processado com sucesso.`);
        // Note: documents will refresh via parent polling or subscription
      } else {
        const errorData = await response.json();
        toast.error(`Falha no processamento: ${errorData.detail || 'Erro desconhecido'}`);
      }
    } catch (error) {
      toast.error("Erro de conexão com o cluster de ingestão.");
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <TooltipProvider>
      <aside className="flex flex-col h-full bg-slate-950/20 backdrop-blur-3xl border-r border-white/5 w-80 shrink-0">
        {/* Brand Header */}
        <div className="p-8 pb-4">
          <div className="flex flex-col gap-4 mb-10 group cursor-default">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/9/97/Casas_Bahia_logo_2020.svg"
              alt="Casas Bahia Logo"
              className="h-9 w-auto object-contain opacity-90 group-hover:opacity-100 transition-all duration-300"
            />
            <div className="flex items-center gap-2 mt-[-10px] ml-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <p className="text-[10px] text-foreground/40 uppercase tracking-[0.2em] font-black">RAG MULTIMODAL</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-black px-3 py-1 rounded-full animate-in fade-in slide-in-from-left duration-700">
              CLUSTER ONLINE
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="cursor-pointer">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 border border-white/5",
                    isUploading ? "bg-primary/20 text-primary animate-spin" : "bg-white/5 text-foreground/40 hover:bg-primary/20 hover:text-primary hover:border-primary/20"
                  )}>
                    {isUploading ? <Zap className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    aria-label="Upload de novo documento"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent side="right">Clique para processar novos arquivos</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="px-8 mt-6">
          <div className="flex items-center justify-between px-1 mb-4">
            <p className="text-subtitle">Silo de Conhecimento</p>
            <Badge variant="outline" className="bg-white/5 border-white/5 text-[10px] font-black tracking-widest text-foreground/30 px-2">
              {documents.length}
            </Badge>
          </div>
        </div>

        {/* Dynamic Content */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-8 pb-10">
            {/* Documents Section */}
            <div className="space-y-1 text-left">
              {sidebarLoading && documents.length === 0 ? (
                <div className="space-y-3 pt-2">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-14 w-[285px] bg-white/5 rounded-2xl" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-20">
                  <Archive className="w-10 h-10 mb-3" />
                  <p className="text-[11px] font-bold uppercase tracking-widest">Base Vazia</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all duration-300 animate-zoom-in w-[285px]"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="flex items-center gap-4 pr-2 transition-all group-hover:translate-x-1 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-inner">
                          {getDocIcon(doc.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-foreground/70 truncate group-hover:text-white transition-colors uppercase">
                            {doc.name}
                          </p>
                          <p className="text-[9px] font-black uppercase text-foreground/30 tracking-wider">
                            {doc.type || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); onDeleteClick(doc.name); }}
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all rounded-xl shrink-0"
                            aria-label={`Excluir documento ${doc.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="bg-rose-600 text-white font-bold">REMOVER</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trending Section */}
            {trending.length > 0 && (
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between px-1">
                  <p className="text-subtitle">Tendências Ativas</p>
                  <Sparkles className="w-3 h-3 text-primary/40" />
                </div>
                <div className="space-y-3">
                  {trending.slice(0, 5).map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(item.prompt_text || item.text || item.prompt_id)}
                      className="w-[285px] flex flex-col p-4 rounded-2xl bg-white/[0.01] hover:bg-primary/5 hover:border-primary/20 border border-white/5 transition-all duration-300 group text-left relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
                        <Zap className="w-12 h-12 -rotate-12" />
                      </div>

                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-foreground/20 group-hover:text-primary group-hover:bg-primary/20 transition-all duration-500 shadow-inner shrink-0 relative z-10 mt-0.5">
                          <Search className="w-3 h-3" />
                        </div>
                        <div className="relative z-10">
                          <p className="text-[12px] font-bold text-foreground/50 group-hover:text-white transition-colors leading-snug line-clamp-2 break-all uppercase">
                            {item.prompt_text || item.text || item.prompt_id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.03] w-full relative z-10">
                        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all">
                          <Eye className="w-2.5 h-2.5 text-sky-400/80" />
                          <span className="text-[10px] font-black text-foreground/70 group-hover:text-white">{item.views || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all">
                          <Copy className="w-2.5 h-2.5 text-emerald-400/80" />
                          <span className="text-[10px] font-black text-foreground/70 group-hover:text-white">{item.copies || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all">
                          <Share2 className="w-2.5 h-2.5 text-indigo-400/80" />
                          <span className="text-[10px] font-black text-foreground/70 group-hover:text-white">{item.shares || 0}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Global Stats Footer */}
        <div className="p-8 border-t border-white/5 bg-slate-950/40">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-indigo-600 p-0.5 shadow-xl shadow-primary/10 rotate-12">
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-white truncate leading-tight group-hover:text-primary transition-colors">{session?.user?.email?.split('@')[0]}</p>
              <p className="text-subtitle leading-none mt-1.5 opacity-40">Analista Estratégico</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onSignOut}
                  className="h-9 w-9 text-foreground/20 hover:text-white hover:bg-white/5 rounded-xl"
                  aria-label="Encerrar Sessão"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Efetuar Logout</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
