import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FolderTree, ChevronRight } from "lucide-react";

interface CategoryTreeItemProps {
  category: any;
  level: number;
  categoryFilter: string | null;
  onSelectCategory: (id: string | null) => void;
  getSubcategories: (parentId: string) => any[];
  getCategoryCount: (id: string) => number;
}

export function CategoryTreeItem({
  category,
  level,
  categoryFilter,
  onSelectCategory,
  getSubcategories,
  getCategoryCount,
}: CategoryTreeItemProps) {
  const catCount = getCategoryCount(category.id);
  const subcats = getSubcategories(category.id);
  const isSelected = categoryFilter === category.id;
  
  // Check if any child is selected
  const hasSelectedChild = subcats.some((s: any) => 
    s.id === categoryFilter || getSubcategories(s.id).some((n: any) => n.id === categoryFilter)
  );
  
  // Count children with results
  const subcatsWithResults = subcats.filter((s: any) => {
    const sCount = getCategoryCount(s.id);
    const nestedSubs = getSubcategories(s.id);
    return sCount > 0 || nestedSubs.some((n: any) => getCategoryCount(n.id) > 0);
  });
  
  const hasResults = catCount > 0 || subcatsWithResults.length > 0;
  const [isExpanded, setIsExpanded] = useState(hasSelectedChild || hasResults);

  const iconColors = ["text-amber-500", "text-amber-400", "text-amber-300"];
  const iconColor = iconColors[Math.min(level, iconColors.length - 1)];
  const iconSize = level === 0 ? "h-4 w-4" : "h-3 w-3";
  const paddingClass = level === 0 ? "py-2" : "py-1.5";
  const textSize = level === 0 ? "text-sm" : "text-xs";
  
  return (
    <div>
      <div className="flex items-center">
        {subcats.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-muted rounded shrink-0"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
        )}
        {subcats.length === 0 && <div className="w-5" />}
        <button
          onClick={() => onSelectCategory(isSelected ? null : category.id)}
          className={`flex-1 text-left px-2 ${paddingClass} rounded-md ${textSize} transition-colors flex items-center justify-between ${
            isSelected 
              ? "bg-primary text-primary-foreground" 
              : hasSelectedChild
              ? "bg-primary/10"
              : hasResults
              ? "hover:bg-muted"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderTree className={`${iconSize} shrink-0 ${iconColor}`} />
            <span className="truncate">{category.name}</span>
          </div>
          {catCount > 0 && (
            <Badge 
              variant={isSelected ? "secondary" : "outline"} 
              className={`shrink-0 ml-2 ${level === 0 ? "text-xs" : "text-[10px] px-1.5 py-0"}`}
            >
              {catCount}
            </Badge>
          )}
        </button>
      </div>
      
      {/* Subcategories */}
      {isExpanded && subcats.length > 0 && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
          {subcats.map((sub: any) => (
            <CategoryTreeItem
              key={sub.id}
              category={sub}
              level={level + 1}
              categoryFilter={categoryFilter}
              onSelectCategory={onSelectCategory}
              getSubcategories={getSubcategories}
              getCategoryCount={getCategoryCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}