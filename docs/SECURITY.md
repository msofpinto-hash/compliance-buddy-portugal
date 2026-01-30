# Documentação de Segurança - ID Compliance

Este documento descreve a arquitetura de segurança, políticas de Row-Level Security (RLS) e boas práticas implementadas na aplicação.

## Índice

1. [Arquitetura de Segurança](#arquitetura-de-segurança)
2. [Autenticação e Autorização](#autenticação-e-autorização)
3. [Políticas RLS por Tabela](#políticas-rls-por-tabela)
4. [Funções de Segurança](#funções-de-segurança)
5. [Edge Functions](#edge-functions)
6. [Boas Práticas](#boas-práticas)
7. [Checklist de Segurança](#checklist-de-segurança)

---

## Arquitetura de Segurança

### Princípios Fundamentais

1. **Defesa em Profundidade**: Múltiplas camadas de segurança (RLS, Edge Functions, validação client-side)
2. **Princípio do Menor Privilégio**: Utilizadores só acedem aos dados necessários
3. **Separação de Roles**: Admins vs Clientes com permissões distintas
4. **Isolamento por Organização**: Dados de clientes isolados entre organizações

### Roles do Sistema

| Role | Descrição | Permissões |
|------|-----------|------------|
| `admin` | Administradores do sistema | Acesso total a todas as tabelas e funcionalidades |
| `client` | Utilizadores de organizações | Acesso restrito aos dados da sua organização |

---

## Autenticação e Autorização

### Fluxo de Autenticação

1. Utilizador faz login via Supabase Auth
2. Token JWT é gerado com `user_id`
3. RLS policies validam acesso baseado no `auth.uid()`
4. Funções `has_role()` e `user_belongs_to_org()` verificam permissões

### Aprovação de Utilizadores

- Novos utilizadores requerem aprovação de admin (`is_approved = true`)
- Utilizadores não aprovados não conseguem aceder ao sistema
- Admins podem aprovar via painel de administração

### Verificação Server-Side

Todos os Edge Functions críticos implementam verificação server-side:

```typescript
// 1. Verificar Authorization header
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) return 401;

// 2. Extrair e validar token
const token = authHeader.replace('Bearer ', '');
const { data: { user } } = await supabase.auth.getUser(token);
if (!user) return 401;

// 3. Verificar role admin no servidor
const { data: adminRole } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .eq('role', 'admin')
  .maybeSingle();
if (!adminRole) return 403;
```

---

## Políticas RLS por Tabela

### Tabelas de Dados Sensíveis

#### `profiles` (Dados Pessoais)
| Policy | Comando | Condição |
|--------|---------|----------|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |
| Users can insert own profile | INSERT | `auth.uid() = id` |
| Admins can view all profiles | SELECT | `has_role(auth.uid(), 'admin')` |
| Admins can update profiles | UPDATE | `has_role(auth.uid(), 'admin')` |

#### `user_roles` (Controlo de Acesso)
| Policy | Comando | Condição |
|--------|---------|----------|
| Users can view own roles | SELECT | `auth.uid() = user_id` |
| Admins can manage all roles | ALL | `has_role(auth.uid(), 'admin')` |

### Tabelas de Organizações

#### `organizations`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their organizations | SELECT | `user_belongs_to_org(auth.uid(), id)` |
| Admins can view all organizations | SELECT | `has_role(auth.uid(), 'admin')` |
| Admins can manage organizations | ALL | `has_role(auth.uid(), 'admin')` |

#### `documents`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their documents | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can view all documents | SELECT | `has_role(auth.uid(), 'admin')` |
| Admins can manage documents | ALL | `has_role(auth.uid(), 'admin')` |

#### `action_plans`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their action plans | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can view all action plans | SELECT | `has_role(auth.uid(), 'admin')` |
| Admins can manage action plans | ALL | `has_role(auth.uid(), 'admin')` |

#### `alerts` (Com Isolamento por Organização)
| Policy | Comando | Condição |
|--------|---------|----------|
| Users can view their alerts | SELECT | `auth.uid() = user_id OR user_belongs_to_org(auth.uid(), organization_id)` |
| Users can update their alerts | UPDATE | `auth.uid() = user_id OR user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can manage alerts | ALL | `has_role(auth.uid(), 'admin')` |

### Tabelas de Legislação

#### `legislation`
| Policy | Comando | Condição |
|--------|---------|----------|
| Authenticated users can view legislation | SELECT | `true` (requer autenticação) |
| Admins can manage legislation | ALL | `has_role(auth.uid(), 'admin')` |

#### `legal_requirements`
| Policy | Comando | Condição |
|--------|---------|----------|
| Authenticated users can view requirements | SELECT | `true` (requer autenticação) |
| Admins can manage requirements | ALL | `has_role(auth.uid(), 'admin')` |
| Admins can insert requirements | INSERT | `has_role(auth.uid(), 'admin')` |
| Admins can delete requirements | DELETE | `has_role(auth.uid(), 'admin')` |

#### `organization_legislation`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their organization legislation | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can manage organization legislation | ALL | `has_role(auth.uid(), 'admin')` |

### Tabelas de Auditorias

#### `audits`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their audits | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Clients can approve audit plans | UPDATE | `status = 'planned' AND org check` |
| Clients can approve their audits | UPDATE | `user_belongs_to_org() AND status = 'pending_approval'` |
| Admins can manage audits | ALL | `has_role(auth.uid(), 'admin')` |

#### `audit_requirements`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their audit requirements | SELECT | Via subquery em `audits` |
| Admins can manage audit requirements | ALL | `has_role(auth.uid(), 'admin')` |

### Tabelas de Evidências

#### `evidence_templates` (Restrito por Organização)
| Policy | Comando | Condição |
|--------|---------|----------|
| Users can view assigned templates | SELECT | `has_role('admin') OR EXISTS (organization_evidence_requests check)` |
| Admins can manage evidence templates | ALL | `has_role(auth.uid(), 'admin')` |

#### `organization_evidence_requests`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their evidence requests | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Clients can update their evidence requests | UPDATE | `user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can manage organization evidence requests | ALL | `has_role(auth.uid(), 'admin')` |

### Tabelas de Compliance (Com Workflow de Aprovação)

#### `applicabilities`
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their applicabilities | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Clients can update evidence files only | UPDATE | `user_belongs_to_org(auth.uid(), organization_id)` |
| Admins can manage applicabilities | ALL | `has_role(auth.uid(), 'admin')` |
| Admins can view all applicabilities | SELECT | `has_role(auth.uid(), 'admin')` |

> **Nota**: Clientes não podem alterar diretamente o `compliance_status`. Devem criar um pedido de alteração.

#### `compliance_change_requests` (Workflow de Aprovação)
| Policy | Comando | Condição |
|--------|---------|----------|
| Clients can view their compliance requests | SELECT | `user_belongs_to_org(auth.uid(), organization_id)` |
| Clients can create compliance requests | INSERT | `user_belongs_to_org() AND requested_by = auth.uid() AND status = 'pending'` |
| Admins can manage compliance requests | ALL | `has_role(auth.uid(), 'admin')` |

**Fluxo de Aprovação:**
1. Cliente propõe alteração → cria `compliance_change_request` com status `pending`
2. Admin revê o pedido → aprova ou rejeita
3. Se aprovado → admin atualiza `applicabilities` com os valores propostos
4. Histórico mantido na tabela de requests

### Tabelas de Configuração

#### `themes`, `theme_categories`, `legislation_category_mapping`, `legislation_relations`
| Policy | Comando | Condição |
|--------|---------|----------|
| Authenticated users can view | SELECT | `true` |
| Admins can manage | ALL | `has_role(auth.uid(), 'admin')` |

> **Nota**: Em PostgreSQL RLS, quando não existe policy permissiva para uma operação, o acesso é **negado por defeito**. Não é necessário criar policies DENY explícitas.

---

## Funções de Segurança

### `has_role(user_id, role)`

Verifica se um utilizador tem uma role específica.

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

### `user_belongs_to_org(user_id, org_id)`

Verifica se um utilizador pertence a uma organização.

```sql
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;
```

### `get_user_organizations(user_id)`

Retorna todas as organizações de um utilizador.

```sql
CREATE OR REPLACE FUNCTION public.get_user_organizations(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.user_roles
  WHERE user_id = _user_id AND organization_id IS NOT NULL
$$;
```

### `has_module_access(user_id, org_id, module)`

Verifica se um utilizador tem acesso a um módulo específico.

```sql
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _org_id uuid, _module app_module)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_module_permissions
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND module = _module
  )
$$;
```

---

## Edge Functions

### Funções com Verificação Admin

As seguintes Edge Functions requerem autenticação E role admin:

| Função | Descrição |
|--------|-----------|
| `sync-dre` | Sincronização com Diário da República |
| `sync-eurlex` | Sincronização com EUR-Lex |
| `import-legislation` | Importação de legislação |
| `import-excel-legislation` | Importação via Excel |
| `import-pdf-legislation` | Importação via PDF |
| `generate-compliance-report` | Geração de relatórios |
| `firecrawl-scrape` | Web scraping (com validação de domínios) |
| `extract-requirements` | Extração de requisitos com IA |

### Validação de URLs (SSRF Protection)

A função `firecrawl-scrape` implementa proteção contra SSRF:

```typescript
const ALLOWED_DOMAINS = [
  'dre.pt',
  'eur-lex.europa.eu',
  'data.europa.eu',
  // ...outros domínios permitidos
];

function isAllowedUrl(url: string): boolean {
  const parsed = new URL(url);
  // Bloquear IPs privados
  if (isPrivateIP(parsed.hostname)) return false;
  // Verificar domínio permitido
  return ALLOWED_DOMAINS.some(domain => 
    parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
  );
}
```

### Rate Limiting

Implementado via função de base de dados `check_rate_limit()`:

```typescript
// No início da Edge Function, após autenticação
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Usar IP ou user_id como identificador
const identifier = userId || req.headers.get('x-forwarded-for') || 'anonymous';

const { data: rateLimit } = await supabase.rpc('check_rate_limit', {
  p_identifier: identifier,
  p_function_name: 'sync-dre',
  p_max_requests: 10,      // máximo 10 requests
  p_window_seconds: 60     // por minuto
});

if (!rateLimit?.allowed) {
  return new Response(
    JSON.stringify({ 
      error: 'Rate limit exceeded',
      remaining: rateLimit?.remaining || 0,
      reset_at: rateLimit?.reset_at
    }),
    { 
      status: 429, 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(rateLimit?.remaining || 0),
        'X-RateLimit-Reset': rateLimit?.reset_at || ''
      } 
    }
  );
}
```

**Limites recomendados por função:**

| Função | Max Requests | Janela |
|--------|--------------|--------|
| sync-dre | 5 | 5 min |
| sync-eurlex | 5 | 5 min |
| import-* | 10 | 1 min |
| extract-requirements | 20 | 1 min |
| firecrawl-scrape | 30 | 1 min |

---

## Boas Práticas

### Validação de Input

1. **Sempre usar Zod** para validação de schemas:
```typescript
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().max(255),
});
```

2. **Encoding de URLs**:
```typescript
const safeUrl = encodeURIComponent(userInput);
```

3. **Nunca usar `dangerouslySetInnerHTML`** com conteúdo de utilizador

### Armazenamento de Secrets

- ❌ Nunca guardar API keys privadas no código
- ✅ Usar secrets do backend (Lovable Cloud)
- ✅ API keys públicas podem estar no código (ex: Supabase anon key)

### Prevenção de Privilege Escalation

- ❌ Nunca guardar roles na tabela `profiles`
- ✅ Usar tabela separada `user_roles`
- ✅ Verificar roles server-side, não apenas client-side

---

## Checklist de Segurança

### Antes de Deploy

- [ ] RLS ativado em todas as tabelas com dados sensíveis
- [ ] Policies testadas para todos os cenários (admin, client, anónimo)
- [ ] Edge Functions com verificação server-side
- [ ] Secrets configurados corretamente
- [ ] Leaked Password Protection ativado

### Auditorias Periódicas

- [ ] Executar scan de segurança mensal
- [ ] Rever policies após alterações de schema
- [ ] Verificar logs de autenticação
- [ ] Atualizar dependências com vulnerabilidades

### Monitorização

- [ ] Alertas para tentativas de acesso falhadas
- [ ] Logs de operações administrativas
- [ ] Backup regular da base de dados

---

## Pendentes / Melhorias Futuras

| Item | Prioridade | Estado |
|------|------------|--------|
| Ativar Leaked Password Protection | Alta | ⚠️ Pendente (manual) |
| Mover pg_net para schema extensions | Baixa | ❌ Não suportado |
| Rate limiting em Edge Functions | Média | ✅ Implementado |
| Audit logging detalhado | Média | 📋 Planeado |

---

## 5. Sistema de Hard Fail e Gestão de Fontes Externas

### 5.1 Padrão de Plataforma (OBRIGATÓRIO)

> ⚠️ **Este sistema é o padrão obrigatório para TODAS as integrações com fontes externas, atuais e futuras.**

| Regra | Descrição |
|-------|-----------|
| **Estado Persistente** | Todas as fontes têm estado em `external_source_status` (ONLINE / DEGRADED / OFFLINE / BLOCKED) |
| **Fail-Fast** | Verificação de estado ANTES de qualquer chamada à IA ou API externa |
| **Hard Fail Persistido** | Erros de fonte externa geram registo permanente em `legislation_processing_failures` |
| **Proteção de Créditos** | Zero consumo após primeira falha enquanto fonte estiver offline |
| **Reset Explícito** | Estado só pode ser alterado por ação manual ou automação controlada |

### 5.2 Comportamentos Críticos Garantidos

1. **Hard fail persistido e não reprocessado**
   - Erros de fonte externa são gravados na tabela `legislation_processing_failures`
   - Campo `is_permanent = true` bloqueia retries automáticos
   - Mesmo após reloads ou novos runs globais, o item não é reprocessado

2. **Fail-fast quando source_status = offline**
   - Antes de qualquer processamento, as Edge Functions verificam `external_source_status`
   - Se a fonte está `offline` ou `blocked_until > now()`, o job aborta imediatamente
   - **Nenhum crédito é consumido** após a deteção de fonte offline

3. **Bloqueio de consumo de créditos**
   - O abort acontece **antes** de qualquer chamada à IA ou APIs externas
   - Detecção de 3+ falhas consecutivas marca automaticamente a fonte como `offline` por 4h
   - Jobs seguintes encontram a fonte offline e saem sem processar

4. **Reset apenas por ação explícita**
   - O estado `is_permanent = true` impede retries automáticos indefinidamente
   - O campo `blocked_until` define uma janela de bloqueio temporal

### 5.3 Implementação de Novas Fontes

Qualquer nova integração com fonte externa **DEVE** seguir este template:

```typescript
// 1. VERIFICAR ESTADO DA FONTE ANTES de qualquer operação
const { data: sourceAvailable } = await supabase.rpc('is_source_available', { 
  p_source_name: 'nova_fonte' 
});

if (!sourceAvailable) {
  console.log('⏸️ Source nova_fonte is offline, aborting');
  return { skipped: true, reason: 'source_offline' };
}

// 2. Executar operação com try/catch
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_BLOCK = 3;

try {
  const result = await chamarFonteExterna();
  
  // 3. Sucesso: atualizar estado se necessário
  await supabase.rpc('update_source_status', {
    p_source_name: 'nova_fonte',
    p_status: 'online'
  });
  
} catch (error) {
  consecutiveFailures++;
  
  // 4. Registar hard fail para este item
  await supabase.rpc('record_processing_failure', {
    p_legislation_id: itemId,
    p_failure_type: 'nova_fonte_scrape',
    p_failure_reason: error.message,
    p_source: 'nova_fonte',
    p_is_permanent: true
  });
  
  // 5. Bloquear fonte se erros consecutivos atingirem limite
  if (consecutiveFailures >= MAX_FAILURES_BEFORE_BLOCK) {
    await supabase.rpc('update_source_status', {
      p_source_name: 'nova_fonte',
      p_status: 'offline',
      p_error_message: 'Multiple consecutive failures detected',
      p_block_hours: 4
    });
    
    // ABORT: Não processar mais itens
    break;
  }
}
```

### 5.4 Fontes Registadas

| Fonte | Identificador | Descrição |
|-------|---------------|-----------|
| DRE OpenData | `dre_opendata` | API do Diário da República |
| EUR-Lex | `eurlex` | Portal de legislação europeia |
| Firecrawl | `firecrawl` | Serviço de web scraping |

### 5.5 Tabelas Envolvidas

| Tabela | Propósito |
|--------|-----------|
| `external_source_status` | Estado de saúde das fontes (online/degraded/offline) |
| `legislation_processing_failures` | Registo de falhas por item e tipo |

### 5.6 Funções RPC Relevantes

| Função | Propósito |
|--------|-----------|
| `is_source_available(p_source_name)` | Verifica se fonte está disponível |
| `update_source_status(...)` | Atualiza estado da fonte com bloqueio temporal |
| `record_processing_failure(...)` | Grava hard fail com detalhes |

### 5.7 Reset Manual de Estado

```sql
-- Reativar fonte (usar quando API estabilizar)
UPDATE external_source_status 
SET status = 'online', blocked_until = NULL, failure_count = 0
WHERE source_name = 'dre_opendata';

-- Limpar falhas permanentes de um tipo (usar com cautela)
DELETE FROM legislation_processing_failures 
WHERE is_permanent = true AND failure_type = 'metadata_scrape';

-- Verificar estado atual de todas as fontes
SELECT source_name, status, blocked_until, failure_count, error_message
FROM external_source_status;
```

### 5.8 Monitorização

O painel de administração (UnifiedDataQualityPanel) mostra:
- Estado em tempo real de todas as fontes (DRE, EUR-Lex, Firecrawl)
- Badges coloridos (🟢 Online, 🟡 Degraded, 🔴 Offline)
- Tooltips com mensagens de erro e timestamps de bloqueio
- Contadores de pendências que respeitam o estado das fontes

---

## Contactos

Para questões de segurança, contactar a equipa de desenvolvimento.

---

*Última atualização: Janeiro 2026*
