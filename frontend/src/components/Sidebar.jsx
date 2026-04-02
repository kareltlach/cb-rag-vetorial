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
  LogOut,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8001' : '';

export default function Sidebar({ documents, trending, sidebarLoading, onDeleteClick, setInput, session, onSignOut, chats = [], activeChatId, onSelectChat, onNewChat, onDeleteChat }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isChatsOpen, setIsChatsOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
  const [isTrendingOpen, setIsTrendingOpen] = useState(true);
  const [isChatsMax, setIsChatsMax] = useState(false);
  const [isDocsMax, setIsDocsMax] = useState(false);
  const [isTrendingMax, setIsTrendingMax] = useState(false);

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
        <div className="p-8 pb-4 shrink-0">
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

          <div className="flex items-center gap-3">
             <Button 
               variant="default" 
               className="flex-1 bg-primary hover:bg-primary/80 text-white rounded-xl font-black text-[10px] uppercase tracking-widest h-10 shadow-lg shadow-primary/20"
               onClick={onNewChat}
             >
               <Plus className="w-3.5 h-3.5 mr-2" /> Nova Conversa
             </Button>
             
             <Tooltip>
               <TooltipTrigger asChild>
                 <label className="cursor-pointer">
                   <div className={cn(
                     "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 border border-white/5 bg-white/5 text-foreground/40 hover:bg-primary/20 hover:text-primary hover:border-primary/20",
                     isUploading && "animate-spin"
                   )}>
                     <CloudUpload className="w-5 h-5" />
                   </div>
                   <input
                     type="file"
                     className="hidden"
                     onChange={handleFileUpload}
                     disabled={isUploading}
                   />
                 </label>
               </TooltipTrigger>
               <TooltipContent side="right">Upload de Documentos</TooltipContent>
             </Tooltip>
          </div>
        </div>

        {/* Unified Middle Section (Scrollable) */}
        <ScrollArea className="flex-1 px-8 pb-4">
          <div className="space-y-8">
            {/* Conversations Section */}
            <div className={cn("mt-2 transition-all duration-500 flex flex-col min-h-0", isChatsMax ? "flex-1" : "")}>
              <div className="flex items-center justify-between px-1 mb-4 flex-none">
                <div className="flex items-center gap-2 cursor-pointer group/title" onClick={() => setIsChatsOpen(!isChatsOpen)}>
                    {isChatsOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-primary/40" />}
                    <p className="text-subtitle group-hover/title:text-primary transition-colors">Conversas Recentes</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { 
                        setIsChatsMax(!isChatsMax); 
                        if (!isChatsMax) { setIsDocsMax(false); setIsTrendingMax(false); } 
                      }} 
                      className="p-1 hover:bg-white/5 rounded-md text-primary/30 hover:text-primary transition-all"
                    >
                      {isChatsMax ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                    <History className="w-3 h-3 text-primary/40" />
                </div>
              </div>
              
              <div className={cn(
                "overflow-hidden transition-all duration-500",
                !isChatsOpen ? "h-0 opacity-0 mb-0 pointer-events-none" : isChatsMax ? "flex-1 mb-6" : "h-auto mb-6"
              )}>
                  <div className="space-y-2">
                    {chats.length === 0 ? (
                      <p className="text-[10px] text-foreground/20 font-bold uppercase text-center py-4 tracking-widest">Sem Histórico</p>
                    ) : (
                      chats.slice(0, isChatsMax ? 100 : 8).map((chat) => (
                        <div 
                          key={chat.id}
                          onClick={() => onSelectChat(chat.id)}
                          className={cn(
                            "group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all duration-300 border",
                            activeChatId === chat.id 
                              ? "bg-primary/10 border-primary/20 text-white" 
                              : "bg-white/[0.02] border-transparent hover:border-white/5 text-foreground/40 hover:text-white"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <MessageSquare className={cn("w-3.5 h-3.5 shrink-0", activeChatId === chat.id ? "text-primary" : "opacity-40")} />
                            <span className="text-[11px] font-bold truncate uppercase tracking-tight">{chat.title}</span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all ml-2"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
              </div>
            </div>

            {/* Silo de Conhecimento */}
            <div className={cn(
              "transition-all duration-500 flex flex-col min-h-0", 
              isDocsMax ? "flex-1" : (isChatsMax || isTrendingMax) ? "h-0 opacity-0 pointer-events-none overflow-hidden hidden" : "mt-6"
            )}>
              <div className="flex items-center justify-between px-1 mb-4 flex-none">
                <div className="flex items-center gap-2 cursor-pointer group/title" onClick={() => setIsDocsOpen(!isDocsOpen)}>
                    {isDocsOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-primary/40" />}
                    <p className="text-subtitle group-hover/title:text-primary transition-colors">Silo de Conhecimento</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { 
                        setIsDocsMax(!isDocsMax); 
                        if (!isDocsMax) { setIsChatsMax(false); setIsTrendingMax(false); } 
                      }} 
                      className="p-1 hover:bg-white/5 rounded-md text-primary/30 hover:text-primary transition-all"
                    >
                      {isDocsMax ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                    <Badge variant="outline" className="bg-white/5 border-white/5 text-[10px] font-black tracking-widest text-foreground/30 px-2">
                      {documents.length}
                    </Badge>
                </div>
              </div>

              <div className={cn(
                  "overflow-hidden transition-all duration-500",
                  !isDocsOpen ? "h-0 opacity-0 pointer-events-none" : isDocsMax ? "flex-1" : "h-auto"
                )}>
                  <div className="space-y-1 text-left pb-4">
                    {sidebarLoading && documents.length === 0 ? (
                      <div className="space-y-3 pt-2">
                        {[1, 2, 3, 4].map(i => (
                          <Skeleton key={i} className="h-14 w-full bg-white/5 rounded-2xl" />
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
                            className="group relative flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all duration-300 animate-zoom-in w-full"
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
              </div>
            </div>

            {/* Trending Section */}
            {!isChatsMax && !isDocsMax && trending.length > 0 && (
                <div className={cn(
                  "transition-all duration-500 flex flex-col min-h-0",
                  isTrendingMax ? "flex-1 pb-6" : "mt-2"
                )}>
                    <div className="flex items-center justify-between px-1 mb-4 flex-none">
                      <div className="flex items-center gap-2 cursor-pointer group/title" onClick={() => setIsTrendingOpen(!isTrendingOpen)}>
                          {isTrendingOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-primary/40" />}
                          <p className="text-subtitle group-hover/title:text-primary transition-colors">Tendências Ativas</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { 
                            setIsTrendingMax(!isTrendingMax); 
                            if (!isTrendingMax) { setIsChatsMax(false); setIsDocsMax(false); } 
                          }} 
                          className="p-1 hover:bg-white/5 rounded-md text-primary/30 hover:text-primary transition-all"
                        >
                          {isTrendingMax ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        </button>
                        <Sparkles className="w-3 h-3 text-primary/40" />
                      </div>
                    </div>

                    <div className={cn(
                      "overflow-hidden transition-all duration-500",
                      !isTrendingOpen ? "h-0 opacity-0 pointer-events-none" : isTrendingMax ? "flex-1" : "h-auto"
                    )}>
                        <div className="space-y-3 pb-2">
                          {trending.slice(0, isTrendingMax ? 20 : 3).map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => setInput(item.prompt_text || item.text || item.prompt_id)}
                              className="w-full flex flex-col p-3 rounded-xl bg-white/[0.01] hover:bg-primary/5 hover:border-primary/20 border border-white/5 transition-all duration-300 group text-left relative overflow-hidden"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-foreground/20 group-hover:text-primary group-hover:bg-primary/20 transition-all duration-300 shrink-0 mt-0.5">
                                  <Search className="w-2.5 h-2.5" />
                                </div>
                                <p className="text-[11px] font-bold text-foreground/50 group-hover:text-white transition-colors leading-snug line-clamp-2 uppercase">
                                  {item.prompt_text || item.text || item.prompt_id}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                    </div>
                </div>
            )}
          </div>
        </ScrollArea>

        {/* Global Stats Footer */}
        <div className="p-8 border-t border-white/5 bg-slate-950/40 shrink-0">
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
                  className="h-9 w-9 text-foreground/20 hover:text-white hover:bg-white/5 rounded-xl transition-all"
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
