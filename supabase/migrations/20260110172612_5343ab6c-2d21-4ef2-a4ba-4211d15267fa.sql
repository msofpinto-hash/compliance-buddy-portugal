-- Create themes table
CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create theme_categories table (hierarchical)
CREATE TABLE public.theme_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.theme_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create legislation_category_mapping table
CREATE TABLE public.legislation_category_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legislation_id uuid NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.theme_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(legislation_id, category_id)
);

-- Create sync_logs table
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  items_processed integer DEFAULT 0,
  items_added integer DEFAULT 0,
  items_updated integer DEFAULT 0,
  error_message text,
  created_by uuid REFERENCES auth.users(id)
);

-- Add source and external_id to legislation table
ALTER TABLE public.legislation 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS external_id text;

-- Create indexes
CREATE INDEX idx_theme_categories_theme_id ON public.theme_categories(theme_id);
CREATE INDEX idx_theme_categories_parent_id ON public.theme_categories(parent_id);
CREATE INDEX idx_legislation_category_mapping_legislation_id ON public.legislation_category_mapping(legislation_id);
CREATE INDEX idx_legislation_category_mapping_category_id ON public.legislation_category_mapping(category_id);
CREATE INDEX idx_legislation_source ON public.legislation(source);
CREATE INDEX idx_legislation_external_id ON public.legislation(external_id);
CREATE INDEX idx_sync_logs_sync_type ON public.sync_logs(sync_type);

-- Enable RLS
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legislation_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for themes
CREATE POLICY "Authenticated users can view themes" ON public.themes
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage themes" ON public.themes
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for theme_categories
CREATE POLICY "Authenticated users can view categories" ON public.theme_categories
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage categories" ON public.theme_categories
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for legislation_category_mapping
CREATE POLICY "Authenticated users can view mappings" ON public.legislation_category_mapping
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage mappings" ON public.legislation_category_mapping
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for sync_logs
CREATE POLICY "Admins can view sync logs" ON public.sync_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage sync logs" ON public.sync_logs
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_themes_updated_at
BEFORE UPDATE ON public.themes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_theme_categories_updated_at
BEFORE UPDATE ON public.theme_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Insert initial themes
INSERT INTO public.themes (name, description, icon) VALUES
('Ambiente', 'Legislação ambiental e proteção do meio ambiente', 'Leaf'),
('Qualidade', 'Normas de qualidade e certificação', 'Award'),
('Segurança', 'Segurança no trabalho e prevenção de riscos', 'Shield'),
('Energia', 'Eficiência energética e recursos energéticos', 'Zap'),
('Responsabilidade Social', 'Responsabilidade social corporativa', 'Users'),
('Conciliação Familiar e Profissional', 'Equilíbrio trabalho-família', 'Home'),
('Alimentar', 'Segurança e higiene alimentar', 'UtensilsCrossed'),
('Florestas', 'Gestão florestal e biodiversidade', 'TreePine'),
('Sustentabilidade (ESG)', 'Critérios ambientais, sociais e de governança', 'Globe');

-- Insert subcategories for Ambiente
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Água', ARRAY['água', 'recursos hídricos', 'efluentes', 'poluição água']),
  ('Ar', ARRAY['ar', 'emissões', 'atmosfera', 'qualidade ar']),
  ('Ruído', ARRAY['ruído', 'poluição sonora', 'acústica']),
  ('Resíduos', ARRAY['resíduos', 'lixo', 'reciclagem', 'gestão resíduos']),
  ('Solos', ARRAY['solo', 'contaminação', 'terrenos']),
  ('Substâncias Perigosas', ARRAY['substâncias perigosas', 'químicos', 'tóxicos']),
  ('Biodiversidade', ARRAY['biodiversidade', 'fauna', 'flora', 'espécies']),
  ('Avaliação de Impacte Ambiental', ARRAY['AIA', 'impacte ambiental', 'avaliação ambiental']),
  ('Licenciamento Ambiental', ARRAY['licença ambiental', 'licenciamento', 'autorização ambiental'])
) AS sc(name, keywords)
WHERE t.name = 'Ambiente';

-- Insert subcategories for Qualidade
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Sistemas de Gestão da Qualidade', ARRAY['SGQ', 'ISO 9001', 'gestão qualidade']),
  ('Metrologia', ARRAY['metrologia', 'medição', 'calibração']),
  ('Normalização', ARRAY['normalização', 'normas', 'padrões']),
  ('Certificação', ARRAY['certificação', 'certificado', 'acreditação'])
) AS sc(name, keywords)
WHERE t.name = 'Qualidade';

-- Insert subcategories for Segurança
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Segurança e Saúde no Trabalho', ARRAY['SST', 'segurança trabalho', 'saúde ocupacional']),
  ('Equipamentos de Proteção', ARRAY['EPI', 'equipamento proteção', 'proteção individual']),
  ('Prevenção de Acidentes', ARRAY['acidentes', 'prevenção', 'riscos']),
  ('Formação e Informação', ARRAY['formação', 'informação', 'treino segurança']),
  ('Medicina no Trabalho', ARRAY['medicina trabalho', 'saúde trabalhadores', 'exames médicos']),
  ('Máquinas e Equipamentos', ARRAY['máquinas', 'equipamentos', 'segurança máquinas'])
) AS sc(name, keywords)
WHERE t.name = 'Segurança';

-- Insert subcategories for Energia
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Eficiência Energética', ARRAY['eficiência energética', 'poupança energia', 'consumo energético']),
  ('Energias Renováveis', ARRAY['renovável', 'solar', 'eólica', 'biomassa']),
  ('Certificação Energética', ARRAY['certificação energética', 'certificado energético', 'classe energética']),
  ('Mobilidade Elétrica', ARRAY['mobilidade elétrica', 'veículos elétricos', 'carregamento'])
) AS sc(name, keywords)
WHERE t.name = 'Energia';

-- Insert subcategories for Responsabilidade Social
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Direitos Humanos', ARRAY['direitos humanos', 'direitos fundamentais']),
  ('Práticas Laborais', ARRAY['práticas laborais', 'condições trabalho', 'direitos trabalhadores']),
  ('Envolvimento Comunitário', ARRAY['comunidade', 'envolvimento social', 'responsabilidade social']),
  ('Ética Empresarial', ARRAY['ética', 'transparência', 'anticorrupção'])
) AS sc(name, keywords)
WHERE t.name = 'Responsabilidade Social';

-- Insert subcategories for Conciliação Familiar
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Licenças Parentais', ARRAY['licença parental', 'maternidade', 'paternidade']),
  ('Flexibilidade Laboral', ARRAY['teletrabalho', 'horário flexível', 'trabalho remoto']),
  ('Apoio à Família', ARRAY['apoio família', 'creche', 'dependentes'])
) AS sc(name, keywords)
WHERE t.name = 'Conciliação Familiar e Profissional';

-- Insert subcategories for Alimentar
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Segurança Alimentar', ARRAY['segurança alimentar', 'HACCP', 'higiene alimentar']),
  ('Rotulagem', ARRAY['rotulagem', 'rótulos', 'informação alimentar']),
  ('Aditivos e Contaminantes', ARRAY['aditivos', 'contaminantes', 'limites']),
  ('Materiais em Contacto', ARRAY['materiais contacto', 'embalagens', 'plásticos alimentares'])
) AS sc(name, keywords)
WHERE t.name = 'Alimentar';

-- Insert subcategories for Florestas
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Gestão Florestal', ARRAY['gestão florestal', 'silvicultura', 'exploração florestal']),
  ('Prevenção de Incêndios', ARRAY['incêndios', 'prevenção incêndios', 'faixas gestão']),
  ('Certificação Florestal', ARRAY['FSC', 'PEFC', 'certificação florestal'])
) AS sc(name, keywords)
WHERE t.name = 'Florestas';

-- Insert subcategories for ESG
INSERT INTO public.theme_categories (theme_id, name, keywords)
SELECT t.id, sc.name, sc.keywords
FROM public.themes t,
(VALUES 
  ('Relatórios de Sustentabilidade', ARRAY['relatório sustentabilidade', 'GRI', 'divulgação']),
  ('Taxonomia Verde', ARRAY['taxonomia', 'atividades sustentáveis', 'taxonomia UE']),
  ('Due Diligence', ARRAY['due diligence', 'cadeia fornecimento', 'diligência devida']),
  ('Finanças Sustentáveis', ARRAY['finanças verdes', 'obrigações verdes', 'investimento sustentável'])
) AS sc(name, keywords)
WHERE t.name = 'Sustentabilidade (ESG)';