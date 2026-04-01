import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Auth = ({ initialEmail }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [showOTP, setShowOTP] = useState(initialEmail ? true : false);
  const [telegramId, setTelegramId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8001' : '';

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Preenche automaticamente o domínio se não estiver presente
    let finalEmail = email.trim();
    if (finalEmail && !finalEmail.includes('@')) {
      finalEmail += '@casasbahia.com.br';
    }

    try {
      if (isSignUp) {
        if (!finalEmail.toLowerCase().endsWith('@casasbahia.com.br')) {
          setLoading(false);
          setMessage('Erro: Use apenas e-mails corporativos @casasbahia.com.br para se cadastrar.');
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: finalEmail,
          password,
        });
        if (error) throw error;
        setMessage('Cadastro realizado! Verifique seu e-mail (se habilitado) ou tente logar.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: finalEmail,
          password,
        });
        if (error) throw error;

        // Após login Sucesso, verifica status do Telegram
        const statusRes = await fetch(`${API_BASE}/api/auth/otp/status/${finalEmail}`);
        const statusData = await statusRes.json();
        
        if (!statusData.is_verified) {
          setShowOTP(true);
        }
      }
    } catch (error) {
      setMessage(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!telegramId) return setMessage('Erro: Informe seu ID do Telegram.');
    setIsSendingOtp(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.includes('@') ? email : `${email}@casasbahia.com.br`, chat_id: telegramId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setMessage('Sucesso! Código enviado ao seu Telegram.');
    } catch (e) {
      setMessage('Falha ao enviar: ' + e.message);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode) return setMessage('Erro: Digite o código de 6 dígitos.');
    setIsVerifying(true);
    const fullEmail = email.includes('@') ? email : `${email}@casasbahia.com.br`;
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fullEmail, otp_code: otpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      
      // Sucesso! Atualiza o estado global recarregando ou emitindo evento
      window.location.reload(); 
    } catch (e) {
      setMessage('Falha na verificação: ' + e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  if (showOTP) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo-sparkle">🔒</div>
            <h2>Verificação de Segurança</h2>
            <p>Proteja sua conta com o Telegram</p>
          </div>

          <div className="otp-instructions">
            <p>1. Vá ao Telegram e procure por <strong>@userinfobot</strong> para ver seu ID.</p>
            <p>2. Copie o número e cole no campo abaixo.</p>
            <p>3. Clique em enviar e aguarde o código no <strong>@cb_rag_auth_bot</strong>.</p>
          </div>

          <div className="auth-form">
            <div className="input-group">
              <label>Seu ID do Telegram</label>
              <div className="input-with-btn">
                <input
                  type="text"
                  placeholder="Ex: 123456789"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                />
                <button 
                  onClick={handleSendOTP} 
                  className="send-otp-btn"
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? '...' : 'Enviar'}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label>Código de 6 dígitos</label>
              <input
                type="text"
                maxLength="6"
                placeholder="000000"
                className="otp-input"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
              />
            </div>

            <button 
              onClick={handleVerifyOTP} 
              className="auth-submit-btn" 
              disabled={isVerifying}
            >
              {isVerifying ? <div className="loader-sm"></div> : 'Confirmar e Entrar'}
            </button>
          </div>

          {message && <div className={`auth-message ${message.includes('Erro') || message.includes('Falha') ? 'error' : 'success'}`}>{message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-sparkle">✨</div>
          <h2>Casas Bahia RAG</h2>
          <p>{isSignUp ? 'Crie sua conta premium' : 'Acesse seu painel inteligente'}</p>
        </div>

        <form onSubmit={handleAuth} className="auth-form">
          <div className="input-group">
            <label>E-mail ou Usuário</label>
            <div className="email-input-wrapper">
              <input
                type="text"
                placeholder="nome.sobrenome"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <span className="email-suffix">@casasbahia.com.br</span>
            </div>
          </div>

          <div className="input-group">
            <label>Senha</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <div className="loader-sm"></div>
            ) : (
              isSignUp ? 'Cadastrar Agora' : 'Entrar na Plataforma'
            )}
          </button>
        </form>

        {message && <div className={`auth-message ${message.includes('Erro') || message.includes('Falha') ? 'error' : 'success'}`}>{message}</div>}

        <div className="auth-footer">
          <button 
            type="button" 
            className="toggle-auth-btn"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Cadastre-se grátis'}
          </button>
        </div>
      </div>
      
      <div className="auth-bg-decoration">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>
    </div>
  );
};

export default Auth;
