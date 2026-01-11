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
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  X,
  FileText,
  Eye,
  EyeOff,
  Globe,
  Flag,
  TrendingUp,
  Clock,
  BookOpen,
  Sparkles,
  LayoutGrid,
  List
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  
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

  // Fetch stats for dashboard
  const { data: stats } = useQuery({
    queryKey: ["legislation-stats"],
    queryFn: async () => {
      const last30Days = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const last7Days = format(subDays(new Date(), 7), "yyyy-MM-dd");
      
      const [totalResult, ptResult, euResult, last30Result, last7Result] = await Promise.all([
        supabase.from("legislation").select("*", { count: "exact", head: true }),
        supabase.from("legislation").select("*", { count: "exact", head: true }).eq("source", "dre"),
        supabase.from("legislation").select("*", { count: "exact", head: true }).eq("source", "eurlex"),
        supabase.from("legislation").select("*", { count: "exact", head: true }).gte("publication_date", last30Days),
        supabase.from("legislation").select("*", { count: "exact", head: true }).gte("publication_date", last7Days),
      ]);
      
      return {
        total: totalResult.count || 0,
        pt: ptResult.count || 0,
        eu: euResult.count || 0,
        last30Days: last30Result.count || 0,
        last7Days: last7Result.count || 0,
      };
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

  // Get read count
  const { data: readCount } = useQuery({
    queryKey: ["user-legislation-reads-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("user_legislation_reads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (error) throw error;
      return count || 0;
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
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads-count", user?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads-count", user?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["user-legislation-reads-count", user?.id] });
      toast.success("Todos marcados como lidos");
    },
    onError: () => {
      toast.error("Erro ao marcar todos como lidos");
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
    setCurrentPage(1);
  };

  // Calculate pagination
  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    setExpandedItems(new Set());
  };

  // Filter legislation
  const filteredLegislation = legislation?.filter(leg => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch = (
        leg.number.toLowerCase().includes(search) ||
        leg.title.toLowerCase().includes(search) ||
        leg.summary?.toLowerCase().includes(search)
      );
      if (!matchesSearch) return false;
    }
    
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

  // Calculate read progress
  const readProgress = stats?.total ? Math.round(((readCount || 0) / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Biblioteca de Legislação
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalCount || 0} diplomas disponíveis
            </p>
          </div>
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Pesquisar diplomas..." 
              className="pl-9 w-72 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Diplomas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Flag className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.pt || 0}</p>
                  <p className="text-xs text-muted-foreground">Portugal (DRE)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/20">
                  <Globe className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.eu || 0}</p>
                  <p className="text-xs text-muted-foreground">Europa (EUR-Lex)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.last30Days || 0}</p>
                  <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 col-span-2 md:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">Lidos</span>
                </div>
                <span className="text-sm font-bold">{readProgress}%</span>
              </div>
              <Progress value={readProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {readCount || 0} de {stats?.total || 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Tabs value={originFilter} onValueChange={(v) => { setOriginFilter(v as any); setCurrentPage(1); }}>
            <TabsList>
              <TabsTrigger value="all" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Todos
              </TabsTrigger>
              <TabsTrigger value="PT" className="gap-2">
                🇵🇹 Portugal
              </TabsTrigger>
              <TabsTrigger value="EU" className="gap-2">
                🇪🇺 Europa
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex-1" />
          
          <Select value={readFilter} onValueChange={(value: "all" | "read" | "unread") => setReadFilter(value)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="read">
                <span className="flex items-center gap-2">
                  <Eye className="h-3 w-3" /> Lidos
                </span>
              </SelectItem>
              <SelectItem value="unread">
                <span className="flex items-center gap-2">
                  <EyeOff className="h-3 w-3" /> Não lidos
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          
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
          
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Advanced Filters Panel */}
        {showFilters && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
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
                
                <div className="flex-1" />
                
                {activeFiltersCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearAllFilters}
                    className="gap-2 text-muted-foreground self-end"
                  >
                    <X className="h-4 w-4" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile Search */}
        <div className="md:hidden mb-4">
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

        {/* Bulk Actions */}
        <div className="flex items-center gap-2 mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={markAllRead}
            disabled={markAllAsReadMutation.isPending}
            className="gap-2"
          >
            <CheckSquare className="h-4 w-4" />
            Marcar página como lida
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={expandAll}
            className="gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            {expandedItems.size === (legislation?.length || 0) ? "Recolher" : "Expandir"}
          </Button>
          
          <div className="flex-1" />
          
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages || 1}
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className={cn(
            "gap-4",
            viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "space-y-3"
          )}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className={viewMode === "grid" ? "h-48" : "h-24"} />
            ))}
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLegislation?.map((leg) => {
              const isRead = readItems.has(leg.id);
              return (
                <Card
                  key={leg.id}
                  className={cn(
                    "group hover:shadow-lg transition-all duration-300 overflow-hidden",
                    isRead ? "bg-muted/30 border-muted" : "bg-card"
                  )}
                >
                  <div className={cn(
                    "h-2",
                    leg.source === "dre" ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-gradient-to-r from-blue-500 to-indigo-600"
                  )} />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <Badge variant={leg.source === "dre" ? "default" : "secondary"} className="shrink-0">
                        {leg.source === "dre" ? "🇵🇹 PT" : "🇪🇺 EU"}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {leg.document_url && (
                          <a
                            href={leg.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          </a>
                        )}
                        <button
                          onClick={() => toggleRead(leg.id)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            isRead ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {isRead ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    
                    <Link to={`/legislacao/${leg.id}`} className="block group-hover:text-primary transition-colors">
                      <h3 className="font-semibold text-sm mb-1 line-clamp-1">{leg.number}</h3>
                    </Link>
                    
                    <p className="text-xs text-muted-foreground mb-2">
                      {leg.publication_date 
                        ? format(new Date(leg.publication_date), "d 'de' MMMM 'de' yyyy", { locale: pt })
                        : "Data não disponível"
                      }
                    </p>
                    
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {leg.title}
                      {leg.summary && ` - ${leg.summary}`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List View */
          <Card>
            <div className="divide-y">
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_80px] bg-muted/50 text-sm font-medium text-muted-foreground">
                <button 
                  onClick={() => handleSort("date")}
                  className="px-4 py-3 text-left flex items-center gap-1 hover:text-foreground"
                >
                  Data <ArrowUpDown className="h-3 w-3" />
                </button>
                <button 
                  onClick={() => handleSort("title")}
                  className="px-4 py-3 text-left flex items-center gap-1 hover:text-foreground"
                >
                  Diploma <ArrowUpDown className="h-3 w-3" />
                </button>
                <div className="px-4 py-3">Sumário</div>
                <div className="px-4 py-3 text-center">Ações</div>
              </div>

              {/* Table Body */}
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
                    <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_80px] items-start">
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
                        <Badge variant="outline" className="ml-2 text-xs">
                          {leg.source === "dre" ? "🇵🇹" : "🇪🇺"}
                        </Badge>
                      </div>
                      <div className="px-4 py-4">
                        <p className={cn(
                          "text-sm text-muted-foreground",
                          !isExpanded && "line-clamp-2"
                        )}>
                          {leg.title}
                          {leg.summary && ` - ${leg.summary}`}
                        </p>
                        <button
                          onClick={() => toggleExpand(leg.id)}
                          className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          {isExpanded ? (
                            <>Recolher <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Ver mais <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      </div>
                      <div className="px-4 py-4 flex justify-center gap-1">
                        {leg.document_url && (
                          <a
                            href={leg.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-muted"
                          >
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          </a>
                        )}
                        <button
                          onClick={() => toggleRead(leg.id)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            isRead ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {isRead ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
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
                            <Badge variant="outline" className="text-xs">
                              {leg.source === "dre" ? "🇵🇹" : "🇪🇺"}
                            </Badge>
                          </div>
                          <Link 
                            to={`/legislacao/${leg.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {leg.number}
                          </Link>
                        </div>
                        <div className="flex items-center gap-1">
                          {leg.document_url && (
                            <a
                              href={leg.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-muted"
                            >
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            </a>
                          )}
                          <button
                            onClick={() => toggleRead(leg.id)}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              isRead ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {isRead ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
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
                        className="text-xs text-primary hover:underline flex items-center gap-1"
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
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma legislação encontrada</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-2">
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
    </div>
  );
}
