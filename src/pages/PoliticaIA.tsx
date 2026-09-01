import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, ShieldCheck, Eye, UserCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    icon: Sparkles,
    title: "Onde utilizamos IA",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Sugestão de temas e categorias para diplomas legais.</li>
        <li>Apoio à extração de requisitos legais e de metadados de diplomas.</li>
        <li>Deteção de relações entre diplomas (transposição, alteração, revogação).</li>
        <li>Apoio à normalização de títulos e sumários provenientes de fontes oficiais.</li>
      </ul>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Enquadramento legal",
    body: (
      <div className="space-y-3">
        <p>
          A I&amp;D Compliance atua como <strong>responsável pela implantação (deployer)</strong> de
          sistemas de IA de finalidade geral, nos termos do Regulamento (UE) 2024/1689 (Regulamento
          da Inteligência Artificial).
        </p>
        <p>
          As utilizações descritas classificam-se como de <strong>risco limitado ou mínimo</strong>:
          destinam-se a apoio documental e classificação de informação legal pública. Não são
          utilizadas para avaliação de pessoas, recrutamento, biometria, pontuação social nem para
          decidir sobre o acesso a serviços essenciais — pelo que não integram as categorias de
          alto risco do Anexo III.
        </p>
        <p>Não são utilizadas quaisquer práticas proibidas pelo artigo 5.º do Regulamento.</p>
      </div>
    ),
  },
  {
    icon: Eye,
    title: "Transparência",
    body: (
      <p>
        Todo o conteúdo gerado ou sugerido por IA é identificado na interface com a etiqueta
        <strong> “Sugerido por IA”</strong>, em cumprimento do artigo 50.º do Regulamento. O
        utilizador sabe sempre quando está perante um resultado assistido por IA.
      </p>
    ),
  },
  {
    icon: UserCheck,
    title: "Supervisão humana",
    body: (
      <p>
        Nenhuma sugestão de IA produz efeitos definitivos sem validação humana. As classificações,
        requisitos e relações sugeridas são revistos e aprovados por um técnico responsável antes de
        integrarem o dossiê de conformidade do cliente.
      </p>
    ),
  },
  {
    icon: FileText,
    title: "Registo e rastreabilidade",
    body: (
      <p>
        Mantemos um registo interno auditável das operações de IA: operação executada, modelo
        utilizado, diploma associado, data e identificação de quem validou o resultado. Este registo
        está disponível para efeitos de auditoria interna e de demonstração de conformidade.
      </p>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Dados e literacia em IA",
    body: (
      <div className="space-y-3">
        <p>
          Os dados tratados por sistemas de IA restringem-se a texto de legislação pública e
          respetivos metadados. Não são enviados dados pessoais de clientes nem documentos de
          evidência para modelos de IA.
        </p>
        <p>
          Em cumprimento do artigo 4.º do Regulamento, os utilizadores com perfil administrativo
          recebem informação sobre o funcionamento, limitações e riscos das funcionalidades de IA da
          plataforma.
        </p>
      </div>
    ),
  },
];

export default function PoliticaIA() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <header className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-terracotta">
            I&amp;D Compliance
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
            Política de Utilização de Inteligência Artificial
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Como usamos IA nesta plataforma e de que forma cumprimos o Regulamento (UE) 2024/1689.
          </p>
        </header>

        <div className="space-y-6">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <section.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
                <CardTitle className="text-xl">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Documento informativo elaborado pela I&amp;D Compliance. Não constitui certificação de
          conformidade emitida por terceiros. Última revisão: setembro de 2026.
        </p>
      </div>
    </div>
  );
}
