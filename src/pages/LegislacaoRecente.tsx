import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckSquare,
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
import { IDBackground, IDCard } from "@/components/client/IDBackground";

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
    <div className="min-h-screen relative">
      {/* I&D Background */}
      <IDBackground />
      
      <div className="relative z-10">
        {/* Header - I&D Style */}
        <header className="border-b border-stone-200/60 dark:border-amber-900/30 bg-white/95 dark:bg-[#181410]/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="container mx-auto flex items-center gap-4 px-4 py-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-amber-900/30">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold flex items-center gap-2 text-stone-800 dark:text-white">
                <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                Biblioteca de Legislação
              </h1>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {totalCount || 0} diplomas disponíveis
              </p>
            </div>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input 
                placeholder="Pesquisar diplomas..." 
                className="pl-9 w-72 bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40 focus:border-emerald-500 focus:ring-emerald-500/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Stats Cards - I&D Style */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {/* Total Diplomas */}
            <IDCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-white">{stats?.total || 0}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Total Diplomas</p>
                </div>
              </div>
            </IDCard>
            
            {/* Portugal */}
            <IDCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <Flag className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-white">{stats?.pt || 0}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Portugal (DRE)</p>
                </div>
              </div>
            </IDCard>
            
            {/* Europa */}
            <IDCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/40">
                  <Globe className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-white">{stats?.eu || 0}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Europa (EUR-Lex)</p>
                </div>
              </div>
            </IDCard>
            
            {/* Last 30 Days */}
            <IDCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/40">
                  <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-white">{stats?.last30Days || 0}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Últimos 30 dias</p>
                </div>
              </div>
            </IDCard>
            
            {/* Read Progress */}
            <IDCard className="p-4 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-stone-500" />
                  <span className="text-xs text-stone-500">Lidos</span>
                </div>
                <span className="text-sm font-bold text-stone-800 dark:text-white">{readProgress}%</span>
              </div>
              <Progress value={readProgress} className="h-2 bg-stone-200 dark:bg-stone-700" />
              <p className="text-xs text-stone-500 mt-1">
                {readCount || 0} de {stats?.total || 0}
              </p>
            </IDCard>
          </div>

          {/* Quick Filters - I&D Style */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Tabs value={originFilter} onValueChange={(v) => { setOriginFilter(v as any); setCurrentPage(1); }}>
              <TabsList className="bg-stone-100/80 dark:bg-stone-800/50 border border-stone-200/60 dark:border-amber-900/30">
                <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-700 data-[state=active]:text-stone-800 dark:data-[state=active]:text-white">
                  <Sparkles className="h-4 w-4" />
                  Todos
                </TabsTrigger>
                <TabsTrigger value="PT" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-700">
                  <span className="text-sm">PT</span> Portugal
                </TabsTrigger>
                <TabsTrigger value="EU" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-700">
                  <span className="text-sm">EU</span> Europa
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <div className="flex-1" />
            
            <Select value={readFilter} onValueChange={(value: "all" | "read" | "unread") => setReadFilter(value)}>
              <SelectTrigger className="w-[130px] bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40">
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
              className={cn(
                "gap-2",
                showFilters 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                  : "bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              )}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-emerald-500 text-white">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            
            <div className="flex items-center border border-stone-200 dark:border-amber-900/40 rounded-lg overflow-hidden bg-white dark:bg-stone-900/50">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none",
                  viewMode === "list" && "bg-stone-100 dark:bg-stone-700"
                )}
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none",
                  viewMode === "grid" && "bg-stone-100 dark:bg-stone-700"
                )}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Advanced Filters Panel */}
          {showFilters && (
            <IDCard className="mb-4 p-4">
              <div className="flex flex-wrap gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Data de</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40",
                          !dateFrom && "text-stone-400"
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
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Data até</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40",
                          !dateTo && "text-stone-400"
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
                    className="gap-2 text-stone-500 self-end hover:text-stone-700"
                  >
                    <X className="h-4 w-4" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            </IDCard>
          )}

          {/* Mobile Search */}
          <div className="md:hidden mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input 
                placeholder="Pesquisar..." 
                className="pl-9 bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
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
              className="gap-2 bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40 text-stone-700 dark:text-stone-300 hover:bg-stone-50"
            >
              <CheckSquare className="h-4 w-4" />
              Marcar página como lida
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={expandAll}
              className="gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <Maximize2 className="h-4 w-4" />
              {expandedItems.size === (legislation?.length || 0) ? "Recolher" : "Expandir"}
            </Button>
            
            <div className="flex-1" />
            
            <p className="text-sm text-stone-500">
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
                <Skeleton key={i} className={cn(viewMode === "grid" ? "h-48" : "h-24", "bg-stone-200/50 dark:bg-stone-700/30")} />
              ))}
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLegislation?.map((leg) => {
                const isRead = readItems.has(leg.id);
                const isRevoked = !!leg.revocation_date;
                return (
                  <IDCard
                    key={leg.id}
                    className={cn(
                      "group hover:shadow-lg transition-all duration-300 overflow-hidden",
                      isRevoked ? "opacity-75" : "",
                      isRead && !isRevoked ? "bg-stone-50/80 dark:bg-stone-800/40" : ""
                    )}
                  >
                    <div className={cn(
                      "h-1.5",
                      leg.source === "dre" ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-sky-500 to-blue-600"
                    )} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn(
                            "shrink-0 border-stone-300 dark:border-stone-600",
                            leg.source === "dre" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                          )}>
                            {leg.source === "dre" ? "PT" : "EU"}
                          </Badge>
                          {isRevoked && (
                            <Badge variant="outline" className="shrink-0 bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                              Revogado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {leg.document_url && (
                            <button
                              onClick={() => {
                                const newWindow = window.open('about:blank', '_blank');
                                if (newWindow) {
                                  newWindow.opener = null;
                                  newWindow.location.href = leg.document_url!;
                                }
                              }}
                              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                            >
                              <ExternalLink className="h-4 w-4 text-stone-400" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleRead(leg.id)}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              isRead ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400" : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
                            )}
                          >
                            {isRead ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      
                      <Link to={`/legislacao/${leg.id}`} className={cn("block group-hover:text-emerald-600 transition-colors", isRevoked && "text-stone-400")}>
                        <h3 className={cn("font-semibold text-sm mb-1 line-clamp-1 text-stone-800 dark:text-white", isRevoked && "line-through decoration-red-400/50")}>{leg.number}</h3>
                      </Link>
                      
                      <p className="text-xs text-stone-500 mb-2">
                        {leg.publication_date 
                          ? format(new Date(leg.publication_date), "d 'de' MMMM 'de' yyyy", { locale: pt })
                          : "Data não disponível"
                        }
                      </p>
                      
                      <p className={cn("text-sm text-stone-600 dark:text-stone-400 line-clamp-3", isRevoked && "line-through decoration-red-400/50")}>
                        {leg.title}
                        {leg.summary && ` - ${leg.summary}`}
                      </p>
                    </div>
                  </IDCard>
                );
              })}
            </div>
          ) : (
            /* List View */
            <IDCard>
              <div className="divide-y divide-stone-200/60 dark:divide-amber-900/30">
                {/* Table Header */}
                <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_80px] bg-stone-100/50 dark:bg-stone-800/30 text-sm font-medium text-stone-600 dark:text-stone-400">
                  <button 
                    onClick={() => handleSort("date")}
                    className="px-4 py-3 text-left flex items-center gap-1 hover:text-stone-800 dark:hover:text-white"
                  >
                    Data <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button 
                    onClick={() => handleSort("title")}
                    className="px-4 py-3 text-left flex items-center gap-1 hover:text-stone-800 dark:hover:text-white"
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
                  const isRevoked = !!leg.revocation_date;
                  
                  return (
                    <div 
                      key={leg.id} 
                      className={cn(
                        "transition-colors",
                        isRevoked ? "bg-stone-100/50 dark:bg-stone-800/20 opacity-75" : "",
                        isRead && !isRevoked ? "bg-stone-50/50 dark:bg-stone-800/30" : "bg-white dark:bg-transparent"
                      )}
                    >
                      {/* Desktop Row */}
                      <div className="hidden md:grid md:grid-cols-[100px_1fr_2fr_80px] items-start">
                        <div className="px-4 py-4 text-sm text-stone-500">
                          {leg.publication_date 
                            ? format(new Date(leg.publication_date), "dd-MM-yyyy", { locale: pt })
                            : "-"
                          }
                        </div>
                        <div className="px-4 py-4">
                          <Link 
                            to={`/legislacao/${leg.id}`}
                            className={cn("text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-500 dark:hover:text-emerald-400", isRevoked && "line-through decoration-red-400/50 text-stone-400")}
                          >
                            {leg.number}
                          </Link>
                          <Badge variant="outline" className={cn(
                            "ml-2 text-xs border-stone-300 dark:border-stone-600",
                            leg.source === "dre" ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" : "bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
                          )}>
                            {leg.source === "dre" ? "PT" : "EU"}
                          </Badge>
                          {isRevoked && (
                            <Badge variant="outline" className="ml-2 text-xs bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400">
                              Revogado
                            </Badge>
                          )}
                        </div>
                        <div className="px-4 py-4">
                          <p className={cn(
                            "text-sm text-stone-600 dark:text-stone-400",
                            !isExpanded && "line-clamp-2",
                            isRevoked && "line-through decoration-red-400/50"
                          )}>
                            {leg.title}
                            {leg.summary && ` - ${leg.summary}`}
                          </p>
                          <button
                            onClick={() => toggleExpand(leg.id)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 mt-1"
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
                            <button
                              onClick={() => {
                                const newWindow = window.open('about:blank', '_blank');
                                if (newWindow) {
                                  newWindow.opener = null;
                                  newWindow.location.href = leg.document_url!;
                                }
                              }}
                              className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-700"
                            >
                              <ExternalLink className="h-4 w-4 text-stone-400" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleRead(leg.id)}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              isRead ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400" : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
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
                              <span className="text-xs text-stone-500">
                                {leg.publication_date 
                                  ? format(new Date(leg.publication_date), "dd-MM-yyyy", { locale: pt })
                                  : "-"
                                }
                              </span>
                              <Badge variant="outline" className={cn(
                                "text-xs border-stone-300",
                                leg.source === "dre" ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600"
                              )}>
                                {leg.source === "dre" ? "PT" : "EU"}
                              </Badge>
                            </div>
                            <Link 
                              to={`/legislacao/${leg.id}`}
                              className="text-sm font-medium text-emerald-600 hover:underline"
                            >
                              {leg.number}
                            </Link>
                          </div>
                          <div className="flex items-center gap-1">
                            {leg.document_url && (
                              <button
                                onClick={() => {
                                  const newWindow = window.open('about:blank', '_blank');
                                  if (newWindow) {
                                    newWindow.opener = null;
                                    newWindow.location.href = leg.document_url!;
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-stone-100"
                              >
                                <ExternalLink className="h-4 w-4 text-stone-400" />
                              </button>
                            )}
                            <button
                              onClick={() => toggleRead(leg.id)}
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                isRead ? "text-emerald-600 bg-emerald-100" : "text-stone-400 hover:bg-stone-100"
                              )}
                            >
                              {isRead ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <p className={cn(
                          "text-sm text-stone-600",
                          !isExpanded && "line-clamp-2"
                        )}>
                          {leg.title}
                          {leg.summary && ` - ${leg.summary}`}
                        </p>
                        <button
                          onClick={() => toggleExpand(leg.id)}
                          className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
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
              </div>
            </IDCard>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1">
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
                      size="sm"
                      onClick={() => goToPage(pageNum)}
                      className={cn(
                        "w-9 h-9",
                        currentPage === pageNum 
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                          : "bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
                      )}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="bg-white dark:bg-stone-900/50 border-stone-200 dark:border-amber-900/40"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
