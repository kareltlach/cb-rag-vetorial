-- 
-- MIGRATION: 001_create_prompt_statistics.sql
-- Descrição: Cria a tabela de métricas para os prompts do RAG Multimodal.
--

-- 1. Criar a tabela de estatísticas
CREATE TABLE IF NOT EXISTS public.prompt_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id TEXT UNIQUE NOT NULL,
    views BIGINT DEFAULT 0,
    copies BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar o Row Level Security (RLS)
ALTER TABLE public.prompt_statistics ENABLE ROW LEVEL SECURITY;

-- 3. Criar políticas de acesso para a role 'anon' (usada pelo frontend)

-- Permitir leitura pública das estatísticas
CREATE POLICY "Allow public read access" 
ON public.prompt_statistics 
FOR SELECT 
TO anon 
USING (true);

-- Permitir que o frontend registre novos prompts
CREATE POLICY "Allow public insert access" 
ON public.prompt_statistics 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Permitir que o frontend incremente os contadores
CREATE POLICY "Allow public update access" 
ON public.prompt_statistics 
FOR UPDATE 
TO anon 
USING (true)
WITH CHECK (true);

-- 4. Funções auxiliares para atualização automática do 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_prompt_statistics_updated_at
    BEFORE UPDATE ON public.prompt_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_prompt_id ON public.prompt_statistics(prompt_id);
CREATE INDEX IF NOT EXISTS idx_trending_views ON public.prompt_statistics(views DESC);

-- 
-- FIM DA MIGRAÇÃO
-- 
