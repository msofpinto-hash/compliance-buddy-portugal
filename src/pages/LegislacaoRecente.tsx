import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Maximize2,
  Search,
  ArrowUpDown
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function LegislacaoRecente() {
  const { user } = useAuth();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [readItems, setReadItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"date" | "title">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch recent legislation
  const { data: legislation, isLoading } = useQuery({
    queryKey: ["legislation-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("*")
        .order("publication_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const toggleRead = (id: string) => {
    const newRead = new Set(readItems);
    if (newRead.has(id)) {
      newRead.delete(id);
    } else {
      newRead.add(id);
    }
    setReadItems(newRead);
  };

  const markAllRead = () => {
    if (legislation) {
      setReadItems(new Set(legislation.map(l => l.id)));
    }
  };

  const markAllUnread = () => {
    setReadItems(new Set());
  };

  const expandAll = () => {
    if (legislation) {
      if (expandedItems.size === legislation.length) {
        setExpandedItems(new Set());
      } else {
        setExpandedItems(new Set(legislation.map(l => l.id)));
      }
    }
  };

  const handleSort = (field: "date" | "title") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Filter and sort legislation
  const filteredLegislation = legislation?.filter(leg => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      leg.number.toLowerCase().includes(search) ||
      leg.title.toLowerCase().includes(search) ||
      leg.summary?.toLowerCase().includes(search)
    );
  }).sort((a, b) => {
    if (sortField === "date") {
      const dateA = a.publication_date ? new Date(a.publication_date).getTime() : 0;
      const dateB = b.publication_date ? new Date(b.publication_date).getTime() : 0;
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    } else {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      return sortOrder === "asc" 
        ? titleA.localeCompare(titleB) 
        : titleB.localeCompare(titleA);
    }
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Legislação Recente</h1>
            <p className="text-sm text-muted-foreground">
              {filteredLegislation?.length || 0} diplomas encontrados
            </p>
          </div>
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Pesquisar..." 
              className="pl-9 w-64 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Bulk Actions */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3 flex flex-wrap gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={markAllRead}
            className="gap-2"
          >
            <CheckSquare className="h-4 w-4" />
            Marcar Todos
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={markAllUnread}
            className="gap-2"
          >
            <Square className="h-4 w-4" />
            Desmarcar Todos
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={expandAll}
            className="gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            {expandedItems.size === (legislation?.length || 0) ? "Recolher Todos" : "Expandir Todos"}
          </Button>
        </div>
      </div>

      {/* Mobile Search */}
      <div className="md:hidden border-b bg-background px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <main className="container mx-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_50px_50px] bg-muted/50 border-b">
              <button 
                onClick={() => handleSort("date")}
                className="px-4 py-3 text-left text-sm font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground"
              >
                Data
                <ArrowUpDown className="h-3 w-3" />
              </button>
              <button 
                onClick={() => handleSort("title")}
                className="px-4 py-3 text-left text-sm font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground"
              >
                Título
                <ArrowUpDown className="h-3 w-3" />
              </button>
              <div className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Sumário
              </div>
              <div className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                
              </div>
              <div className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                Lido
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y">
              {filteredLegislation?.map((leg) => {
                const isExpanded = expandedItems.has(leg.id);
                const isRead = readItems.has(leg.id);
                
                return (
                  <div 
                    key={leg.id} 
                    className={cn(
                      "transition-colors",
                      isRead ? "bg-muted/20" : "bg-background"
                    )}
                  >
                    {/* Desktop Row */}
                    <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_50px_50px] items-start">
                      <div className="px-4 py-4 text-sm text-muted-foreground">
                        {leg.publication_date 
                          ? format(new Date(leg.publication_date), "dd-MM-yyyy", { locale: pt })
                          : "-"
                        }
                      </div>
                      <div className="px-4 py-4">
                        <Link 
                          to={`/legislacao/${leg.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {leg.number}
                        </Link>
                        {leg.source && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {leg.source === "dre" ? "PT" : leg.source === "eurlex" ? "EU" : leg.source}
                          </Badge>
                        )}
                      </div>
                      <div className="px-4 py-4">
                        <p className={cn(
                          "text-sm text-muted-foreground",
                          !isExpanded && "line-clamp-2"
                        )}>
                          {leg.title}
                          {leg.summary && (
                            <>
                              {" - "}
                              {leg.summary}
                            </>
                          )}
                        </p>
                        <button
                          onClick={() => toggleExpand(leg.id)}
                          className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          {isExpanded ? (
                            <>Recolher <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Ver mais <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      </div>
                      <div className="px-4 py-4 flex justify-center">
                        {leg.document_url && (
                          <a
                            href={leg.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      <div className="px-4 py-4 flex justify-center">
                        <Checkbox 
                          checked={isRead}
                          onCheckedChange={() => toggleRead(leg.id)}
                        />
                      </div>
                    </div>

                    {/* Mobile Row */}
                    <div className="md:hidden p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">
                              {leg.publication_date 
                                ? format(new Date(leg.publication_date), "dd-MM-yyyy", { locale: pt })
                                : "-"
                              }
                            </span>
                            {leg.source && (
                              <Badge variant="outline" className="text-xs">
                                {leg.source === "dre" ? "PT" : leg.source === "eurlex" ? "EU" : leg.source}
                              </Badge>
                            )}
                          </div>
                          <Link 
                            to={`/legislacao/${leg.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {leg.number}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          {leg.document_url && (
                            <a
                              href={leg.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <Checkbox 
                            checked={isRead}
                            onCheckedChange={() => toggleRead(leg.id)}
                          />
                        </div>
                      </div>
                      <p className={cn(
                        "text-sm text-muted-foreground",
                        !isExpanded && "line-clamp-2"
                      )}>
                        {leg.title}
                        {leg.summary && ` - ${leg.summary}`}
                      </p>
                      <button
                        onClick={() => toggleExpand(leg.id)}
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>Recolher <ChevronUp className="h-3 w-3" /></>
                        ) : (
                          <>Ver mais <ChevronDown className="h-3 w-3" /></>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredLegislation?.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  Nenhuma legislação encontrada
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
