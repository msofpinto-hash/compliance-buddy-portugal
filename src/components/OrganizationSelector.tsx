import { Building2, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
}

interface OrganizationSelectorProps {
  organizations: Organization[];
  selectedOrgId: string | null;
  onSelect: (orgId: string | null) => void;
}

export function OrganizationSelector({
  organizations,
  selectedOrgId,
  onSelect,
}: OrganizationSelectorProps) {
  if (organizations.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">{organizations[0]?.name || "Sem organização"}</span>
      </div>
    );
  }

  const selectedOrg = selectedOrgId 
    ? organizations.find(o => o.id === selectedOrgId) 
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[150px] truncate">
            {selectedOrg ? selectedOrg.name : "Todas as organizações"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem 
          onClick={() => onSelect(null)}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Todas as organizações</span>
          </div>
          {selectedOrgId === null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => onSelect(org.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{org.name}</span>
            {selectedOrgId === org.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
