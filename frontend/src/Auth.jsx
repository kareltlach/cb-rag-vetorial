import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  ArrowRight, 
  ArrowLeft,
  Mail, 
  Lock, 
  CheckCircle, 
  AlertCircle, 
  ShieldCheck, 
  Zap,
  Command,
  ChevronRight,
  ShieldAlert,
  Send,
  MessageSquare,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './components/ui/card';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { cn } from './lib/utils';

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8001' : '';

export default function Auth({ initialEmail = '' }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [chatId, setChatId] = useState('');
  const [step, setStep] = useState('auth'); // 'auth' -> 'link' -> 'verify'
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      toast.success("Credenciais de acesso validadas.");

      // Verifica se já tem Telegram ID vinculado
      const statusRes = await fetch(`${API_BASE}/api/auth/otp/status/${encodeURIComponent(email)}`);
      const statusData = await statusRes.json();

      if (statusData && statusData.is_verified) {
        // Já tem vínculo, vai direto para verificação (envia OTP)
        await handleSendOtp();
      } else {
        // Precisa vincular o Telegram ID
        setStep('link');
      }
    } catch (error) {
      toast.error(`Falha na Autenticação: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      
      toast.success("Terminal registrado. Procedendo para vincular Telegram.");
      setStep('link');
    } catch (error) {
      toast.error(`Erro no Registro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      // Se estamos no passo 'link', usamos o chatId que o usuário digitou
      // Caso contrário, o backend já tem o chat_id salvo
      const otpRes = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, chat_id: chatId })
      });
      
      if (otpRes.ok) {
        setStep('verify');
        toast.info("Código de segurança enviado via Telegram.");
      } else {
        toast.error("Cluster MFA indisponível temporariamente.");
      }
    } catch (error) {
      toast.error("Erro ao enviar código de segurança.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otpCode })
      });
      
      if (res.ok) {
        toast.success("Handshake completo. Acesso concedido.");
        window.location.reload();
      } else {
        toast.error("Assinatura de segurança inválida.");
      }
    } catch (error) {
      toast.error("Erro crítico na verificação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] font-sans selection:bg-primary/30 relative overflow-hidden">
        <Toaster position="top-center" richColors theme="dark" />
        
        {/* Abstract Background Decor */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
           <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/5 blur-[120px] rounded-full animate-pulse-slow"></div>
           <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 blur-[100px] rounded-full animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="w-full max-w-md p-6 relative z-10 animate-fade-in-up">
           {/* Logo / Brand */}
           <div className="flex flex-col items-center mb-12 group">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/9/97/Casas_Bahia_logo_2020.svg" 
              alt="Casas Bahia Logo" 
              className="h-7 w-auto object-contain mb-4 transition-all duration-500 hover:scale-105"
            />
              <p className="text-foreground/30 text-[10px] font-black uppercase tracking-[0.4em]">Neural RAG Workstation • v2.0</p>
           </div>

           {step === 'auth' ? (
             <Card className="glass-card border-white/5 rounded-[2.5rem] shadow-2xl relative overflow-hidden transform hover:scale-[1.005] transition-transform duration-500">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-600 to-primary/40"></div>
                <CardHeader className="p-10 pb-6 text-center">
                   <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">
                     {authMode === 'login' ? 'Autenticação' : 'Registro de Terminal'}
                   </CardTitle>
                   <CardDescription className="text-foreground/40 font-bold text-sm pt-2">
                     {authMode === 'login' ? 'Conecte-se ao ecossistema de inteligência privada.' : 'Crie sua identidade operacional no cluster.'}
                   </CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-4">
                   <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp} className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-subtitle ml-1">Usuário Operacional</Label>
                        <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-primary transition-colors z-10">
                             <Mail className="w-5 h-5" />
                          </div>
                          <Input 
                            type="text" 
                            required 
                            className="bg-slate-950/40 border-white/10 h-14 pl-12 pr-[140px] rounded-2xl focus-visible:ring-primary/40 text-white placeholder:text-white/5 font-bold"
                            placeholder="seu.usuario"
                            value={email.split('@')[0]}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.includes('@')) {
                                setEmail(val);
                              } else {
                                setEmail(val ? `${val}@casasbahia.com.br` : '');
                              }
                            }}
                          />
                          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-foreground/20 font-black text-[11px] uppercase tracking-widest pointer-events-none select-none">
                            @casasbahia.com.br
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-subtitle ml-1">Assinatura Digital (Senha)</Label>
                        <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-primary transition-colors">
                             <Lock className="w-5 h-5" />
                          </div>
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            required 
                            className="bg-slate-950/40 border-white/10 h-14 pl-12 pr-12 rounded-2xl focus-visible:ring-primary/40 text-white placeholder:text-white/5 font-bold"
                            placeholder="••••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/20 hover:text-primary transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      <Button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/80 text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95"
                      >
                        {loading ? 'Sincronizando...' : (authMode === 'login' ? 'Acessar Workspace' : 'Confirmar Registro')}
                        {!loading && <ChevronRight className="w-4 h-4 ml-2" />}
                      </Button>
                   </form>
                </CardContent>
                <CardFooter className="p-10 pt-0 flex justify-center">
                   <button 
                     onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                     className="text-[11px] font-black uppercase tracking-widest text-foreground/30 hover:text-primary transition-colors"
                   >
                     {authMode === 'login' ? 'Necessita acesso? Registrar terminal' : 'Já possui identidade? Autenticar'}
                   </button>
                </CardFooter>
             </Card>
           ) : step === 'link' ? (
             <Card className="glass-card border-white/5 rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-zoom-in">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500/20"></div>
                <CardHeader className="p-10 pb-6 text-center">
                   <div className="w-16 h-16 bg-amber-500/10 rounded-[1.5rem] flex items-center justify-center text-amber-500 mx-auto mb-6 shadow-inner">
                      <Zap className="w-8 h-8" />
                   </div>
                   <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Pareamento Telegram</CardTitle>
                   <CardDescription className="text-foreground/40 font-bold text-sm pt-2">
                     Vincule sua conta ao bot de segurança para ativação do terminal.
                   </CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-4">
                   <form onSubmit={handleSendOtp} className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-subtitle ml-1 text-amber-500/60">Seu Chat ID (Telegram)</Label>
                        <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-amber-500 transition-colors">
                             <Command className="w-5 h-5" />
                          </div>
                          <Input 
                            type="text" 
                            required 
                            className="bg-slate-950/40 border-white/10 h-14 pl-12 rounded-2xl focus-visible:ring-amber-500/40 text-white placeholder:text-white/5 font-bold"
                            placeholder="Ex: 582910293"
                            value={chatId}
                            onChange={(e) => setChatId(e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-2">
                         <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Como obter o ID?</p>
                         <p className="text-[11px] text-foreground/40 font-bold leading-relaxed">
                           Envie /start para o bot <span className="text-white">@userinfobot</span> no Telegram para visualizar seu código numérico de identificação.
                         </p>
                      </div>

                      <Button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full h-14 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-amber-900/40 border-none transition-all"
                      >
                        {loading ? 'Processando...' : 'Vincular e Enviar Código'}
                        {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                      </Button>
                      <button 
                        type="button" 
                        onClick={() => setStep('auth')}
                        className="w-full text-[10px] font-black text-foreground/20 uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Voltar ao login
                      </button>
                   </form>
                </CardContent>
             </Card>
           ) : (
             <Card className="glass-card border-white/5 rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-zoom-in">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500/20"></div>
                <CardHeader className="p-10 pb-6 text-center">
                   <div className="w-16 h-16 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center text-emerald-500 mx-auto mb-6 shadow-inner animate-pulse">
                      <ShieldCheck className="w-8 h-8" />
                   </div>
                   <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Verificação 2-Fatores</CardTitle>
                   <CardDescription className="text-foreground/40 font-bold text-sm pt-2">
                     Insira o código enviado para o seu dispositivo Telegram pareado.
                   </CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-4">
                   <form onSubmit={handleVerifyOtp} className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-subtitle ml-1 text-emerald-500/60">Código de Autorização</Label>
                        <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/20 group-focus-within:text-emerald-500 transition-colors">
                             <MessageSquare className="w-5 h-5" />
                          </div>
                          <Input 
                            type="text" 
                            required 
                            className="bg-slate-950/40 border-white/10 h-14 pl-12 rounded-2xl focus-visible:ring-emerald-500/40 text-white placeholder:text-white/5 font-black text-center tracking-[0.5em] text-lg"
                            placeholder="000000"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-emerald-900/40 border-none transition-all"
                      >
                        {loading ? 'Verificando...' : 'Confirmar Identidade'}
                        {!loading && <ShieldCheck className="w-4 h-4 ml-2" />}
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setStep('auth')}
                        className="w-full h-12 rounded-2xl text-foreground/20 font-black uppercase text-[10px] tracking-widest hover:text-white"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Voltar ao Login
                      </Button>
                   </form>
                </CardContent>
                <CardFooter className="p-10 pt-0">
                   <div className="flex items-center gap-3 w-full p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                      <ShieldAlert className="w-5 h-5 text-emerald-500/40" />
                      <p className="text-[10px] font-bold text-foreground/30 leading-tight">Canal de segurança criptografado P2P via Telegram API.</p>
                   </div>
                </CardFooter>
             </Card>
           )}

           {/* Security Badges Group */}
           <div className="mt-12 flex justify-center gap-8 opacity-20 filter grayscale group-hover:grayscale-0 transition-all duration-700">
              <div className="flex flex-col items-center gap-2">
                 <ShieldCheck className="w-5 h-5 mb-1" />
                 <span className="text-[8px] font-black uppercase tracking-widest">Encrypted</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                 <Zap className="w-5 h-5 mb-1" />
                 <span className="text-[8px] font-black uppercase tracking-widest">Optimized</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                 <Lock className="w-5 h-5 mb-1" />
                 <span className="text-[8px] font-black uppercase tracking-widest">Private</span>
              </div>
           </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
