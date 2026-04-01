import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');

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
      }
    } catch (error) {
      setMessage(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

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
