import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "A password deve ter pelo menos 8 caracteres")
    .regex(/[A-Z]/, "Deve conter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "Deve conter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "Deve conter pelo menos um número")
    .regex(/[^A-Za-z0-9]/, "Deve conter pelo menos um caractere especial"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As passwords não coincidem",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    mode: "onChange",
  });

  const newPassword = watch("newPassword", "");

  // Password strength indicators
  const passwordChecks = [
    { label: "Mínimo 8 caracteres", valid: newPassword.length >= 8 },
    { label: "Uma letra maiúscula", valid: /[A-Z]/.test(newPassword) },
    { label: "Uma letra minúscula", valid: /[a-z]/.test(newPassword) },
    { label: "Um número", valid: /[0-9]/.test(newPassword) },
    { label: "Um caractere especial", valid: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const validChecks = passwordChecks.filter((c) => c.valid).length;
  const strengthPercentage = (validChecks / passwordChecks.length) * 100;

  const getStrengthColor = () => {
    if (strengthPercentage <= 20) return "bg-red-500";
    if (strengthPercentage <= 40) return "bg-orange-500";
    if (strengthPercentage <= 60) return "bg-yellow-500";
    if (strengthPercentage <= 80) return "bg-lime-500";
    return "bg-green-500";
  };

  const getStrengthLabel = () => {
    if (strengthPercentage <= 20) return "Muito fraca";
    if (strengthPercentage <= 40) return "Fraca";
    if (strengthPercentage <= 60) return "Média";
    if (strengthPercentage <= 80) return "Forte";
    return "Muito forte";
  };

  const onSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) {
        if (error.message.includes("should be different")) {
          toast.error("A nova password deve ser diferente da atual");
        } else {
          toast.error("Erro ao alterar password: " + error.message);
        }
        return;
      }

      toast.success("Password alterada com sucesso!");
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao alterar password: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Alterar Password</DialogTitle>
              <DialogDescription>
                Introduza a sua nova password
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Introduza a nova password"
                {...register("newPassword")}
                className={cn(errors.newPassword && "border-destructive")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Password Strength Indicator */}
          {newPassword && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Força da password</span>
                  <span className={cn(
                    "font-medium",
                    strengthPercentage <= 40 ? "text-red-500" : 
                    strengthPercentage <= 60 ? "text-yellow-600" : "text-green-600"
                  )}>
                    {getStrengthLabel()}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all duration-300", getStrengthColor())}
                    style={{ width: `${strengthPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {passwordChecks.map((check, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    {check.valid ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={cn(
                      check.valid ? "text-green-600" : "text-muted-foreground"
                    )}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirme a nova password"
                {...register("confirmPassword")}
                className={cn(errors.confirmPassword && "border-destructive")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || validChecks < 5}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  A alterar...
                </>
              ) : (
                "Alterar Password"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
