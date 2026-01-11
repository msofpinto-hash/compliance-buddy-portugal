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
| Rate limiting em Edge Functions | Média | 📋 Planeado |
| Audit logging detalhado | Média | 📋 Planeado |

---

## Contactos

Para questões de segurança, contactar a equipa de desenvolvimento.

---

*Última atualização: Janeiro 2026*
