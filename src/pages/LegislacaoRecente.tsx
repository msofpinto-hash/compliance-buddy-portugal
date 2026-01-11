import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Maximize2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  CalendarIcon,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function LegislacaoRecente() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"date" | "title">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [originFilter, setOriginFilter] = useState<"all" | "PT" | "EU">("all");
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  const itemsPerPage = 25;

  // Fetch total count with filters
  const { data: totalCount } = useQuery({
    queryKey: ["legislation-count", originFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("legislation")
        .select("*", { count: "exact", head: true });
      
      // Apply origin filter
      if (originFilter === "PT") {
        query = query.eq("source", "dre");
      } else if (originFilter === "EU") {
        query = query.eq("source", "eurlex");
      }
      
      // Apply date filters
      if (dateFrom) {
        query = query.gte("publication_date", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        query = query.lte("publication_date", format(dateTo, "yyyy-MM-dd"));
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch legislation with pagination and filters
  const { data: legislation, isLoading } = useQuery({
    queryKey: ["legislation-list", currentPage, sortField, sortOrder, originFilter, dateFrom, dateTo],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const orderColumn = sortField === "date" ? "publication_date" : "title";
      
      let query = supabase
        .from("legislation")
        .select("*");
      
      // Apply origin filter
      if (originFilter === "PT") {
        query = query.eq("source", "dre");
      } else if (originFilter === "EU") {
        query = query.eq("source", "eurlex");
      }
      
      // Apply date filters
      if (dateFrom) {
        query = query.gte("publication_date", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        query = query.lte("publication_date", format(dateTo, "yyyy-MM-dd"));
      }
      
      const { data, error } = await query
        .order(orderColumn, { ascending: sortOrder === "asc" })
        .range(from, to);
      if (error) throw error;
      return data;
    },
  });

  // Fetch user's read items
  const { data: readItemsData } = useQuery({
    queryKey: ["user-legislation-reads", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_legislation_reads")
        .select("legislation_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map(item => item.legislation_id);
    },
    enabled: !!user?.id,
  });

  // Convert to Set for easier lookup
  const readItems = new Set(readItemsData || []);

  // Mutation to mark as read
  const markAsReadMutation = useMutation({
    mutationFn: async (legislationId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("user_legislation_reads")
        .insert({ user_id: user.id, legislation_id: legislationId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads", user?.id] });
    },
    onError: () => {
      toast.error("Erro ao marcar como lido");
    },
  });

  // Mutation to mark as unread
  const markAsUnreadMutation = useMutation({
    mutationFn: async (legislationId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("user_legislation_reads")
        .delete()
        .eq("user_id", user.id)
        .eq("legislation_id", legislationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads", user?.id] });
    },
    onError: () => {
      toast.error("Erro ao desmarcar como lido");
    },
  });

  // Mutation to mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async (legislationIds: string[]) => {
      if (!user?.id) throw new Error("User not authenticated");
      const itemsToInsert = legislationIds
        .filter(id => !readItems.has(id))
        .map(id => ({ user_id: user.id, legislation_id: id }));
      
      if (itemsToInsert.length === 0) return;
      
      const { error } = await supabase
        .from("user_legislation_reads")
        .insert(itemsToInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads", user?.id] });
      toast.success("Todos marcados como lidos");
    },
    onError: () => {
      toast.error("Erro ao marcar todos como lidos");
    },
  });

  // Mutation to mark all as unread
  const markAllAsUnreadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("user_legislation_reads")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads", user?.id] });
      toast.success("Todos desmarcados");
    },
    onError: () => {
      toast.error("Erro ao desmarcar todos");
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
    if (readItems.has(id)) {
      markAsUnreadMutation.mutate(id);
    } else {
      markAsReadMutation.mutate(id);
    }
  };

  const markAllRead = () => {
    if (legislation) {
      markAllAsReadMutation.mutate(legislation.map(l => l.id));
    }
  };

  const markAllUnread = () => {
    markAllAsUnreadMutation.mutate();
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
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Calculate pagination
  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    setExpandedItems(new Set()); // Reset expanded items when changing page
  };

  // Filter legislation (client-side search and read filter within current page)
  const filteredLegislation = legislation?.filter(leg => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch = (
        leg.number.toLowerCase().includes(search) ||
        leg.title.toLowerCase().includes(search) ||
        leg.summary?.toLowerCase().includes(search)
      );
      if (!matchesSearch) return false;
    }
    
    // Read status filter (client-side as it depends on user data)
    if (readFilter === "read" && !readItems.has(leg.id)) return false;
    if (readFilter === "unread" && readItems.has(leg.id)) return false;
    
    return true;
  });

  // Count active filters
  const activeFiltersCount = [
    originFilter !== "all",
    readFilter !== "all",
    dateFrom !== undefined,
    dateTo !== undefined
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setOriginFilter("all");
    setReadFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1);
  };

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
              {totalCount || 0} diplomas no total • Página {currentPage} de {totalPages || 1}
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

      {/* Bulk Actions & Filters */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={markAllRead}
            disabled={markAllAsReadMutation.isPending}
            className="gap-2"
          >
            <CheckSquare className="h-4 w-4" />
            Marcar Todos
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={markAllUnread}
            disabled={markAllAsUnreadMutation.isPending}
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
          
          <div className="flex-1" />
          
          <Button 
            variant={showFilters ? "default" : "outline"} 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </div>
        
        {/* Filters Panel */}
        {showFilters && (
          <div className="container mx-auto px-4 pb-4">
            <div className="bg-background border rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap gap-4">
                {/* Origin Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Origem</label>
                  <Select value={originFilter} onValueChange={(value: "all" | "PT" | "EU") => { setOriginFilter(value); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                      <SelectItem value="EU">🇪🇺 Europa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Read Status Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <Select value={readFilter} onValueChange={(value: "all" | "read" | "unread") => setReadFilter(value)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="read">Lidos</SelectItem>
                      <SelectItem value="unread">Não lidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Date From Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data de</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal",
                          !dateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={(date) => { setDateFrom(date); setCurrentPage(1); }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Date To Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data até</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal",
                          !dateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={(date) => { setDateTo(date); setCurrentPage(1); }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              {/* Clear Filters */}
              {activeFiltersCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="gap-2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>
        )}
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
                          disabled={markAsReadMutation.isPending || markAsUnreadMutation.isPending}
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
                            disabled={markAsReadMutation.isPending || markAsUnreadMutation.isPending}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  A mostrar {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalCount || 0)} de {totalCount || 0}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => goToPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
