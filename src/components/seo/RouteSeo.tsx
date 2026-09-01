import { Helmet } from "react-helmet-async";
import { useLocation, useParams } from "react-router-dom";

const SITE_URL = "https://idcompliance-lex.com";
const SITE_NAME = "ID Compliance";

type Meta = { title: string; description: string };

const ROUTE_META: Record<string, Meta> = {
  "/": {
    title: "ID Compliance | Conformidade Legal para Empresas",
    description:
      "Plataforma portuguesa de gestão de conformidade legal: legislação atualizada, requisitos, auditorias e planos de ação num só lugar.",
  },
  "/politica-ia": {
    title: "Política de Utilização de IA | ID Compliance",
    description:
      "Como a ID Compliance utiliza inteligência artificial: finalidades, transparência, supervisão humana e conformidade com o Regulamento (UE) 2024/1689.",
  },
  "/auth": {
    title: "Aceder à Plataforma | ID Compliance",
    description:
      "Entre na sua conta ID Compliance para consultar legislação aplicável, requisitos legais e o estado de conformidade da sua organização.",
  },
  "/dashboard": {
    title: "Dashboard de Conformidade | ID Compliance",
    description:
      "Acompanhe indicadores de conformidade legal, requisitos avaliados, prazos e evolução da sua organização em tempo real.",
  },
  "/biblioteca": {
    title: "Biblioteca de Legislação | ID Compliance",
    description:
      "Consulte a biblioteca de diplomas legais nacionais e europeus, organizada por temas, categorias e requisitos aplicáveis.",
  },
  "/progresso": {
    title: "Progresso da Base Legal | ID Compliance",
    description:
      "Gráficos em tempo real do progresso da base legal: diplomas por origem, categorias atribuídas, ligações europeias e relações mapeadas.",
  },
  "/diplomas": {
    title: "Diplomas e Dados em Falta | ID Compliance",
    description:
      "Lista de diplomas legais com título, categorias atribuídas e indicação do que falta: categoria, ligação à legislação europeia e relações.",
  },
  "/legislacao-recente": {
    title: "Legislação Recente | ID Compliance",
    description:
      "Veja os diplomas legais publicados recentemente no Diário da República e no EUR-Lex, com alertas de novidades por tema.",
  },
  "/cliente": {
    title: "Portal do Cliente | ID Compliance",
    description:
      "Área do cliente para gerir conformidade legal, evidências, planos de ação e comunicação com a equipa de auditoria.",
  },
  "/admin": {
    title: "Administração | ID Compliance",
    description:
      "Painel de administração para gerir clientes, legislação, taxonomias e a qualidade dos dados da plataforma.",
  },
  "/settings": {
    title: "Definições da Conta | ID Compliance",
    description:
      "Gira o seu perfil, preferências de notificações e segurança da conta, incluindo autenticação de dois fatores.",
  },
};

const NOT_FOUND: Meta = {
  title: "Página não encontrada | ID Compliance",
  description:
    "A página que procura não existe ou foi movida. Regresse à plataforma ID Compliance para continuar a gerir a sua conformidade legal.",
};

export function RouteSeo() {
  const { pathname } = useLocation();
  const params = useParams();

  const isLegislationDetail = pathname.startsWith("/legislacao/");
  const meta: Meta = isLegislationDetail
    ? {
        title: "Detalhe do Diploma Legal | ID Compliance",
        description:
          "Consulte o texto, requisitos, relações e estado de conformidade deste diploma legal na plataforma ID Compliance.",
      }
    : ROUTE_META[pathname] ?? NOT_FOUND;

  const canonical = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;
  const noIndex = isLegislationDetail || !ROUTE_META[pathname] || Boolean(params.id);

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      {noIndex ? <meta name="robots" content="noindex, follow" /> : null}
    </Helmet>
  );
}

export default RouteSeo;
