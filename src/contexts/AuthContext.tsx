import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session, AuthError, Factor } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface MFAChallenge {
  factorId: string;
}

interface SignInResult {
  error: Error | null;
  mfaRequired?: boolean;
  factorId?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isApproved: boolean;
  isPendingApproval: boolean;
  isLoading: boolean;
  mfaChallenge: MFAChallenge | null;
  has2FAEnabled: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  completeMFAChallenge: () => void;
  cancelMFAChallenge: () => Promise<void>;
  check2FAStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [has2FAEnabled, setHas2FAEnabled] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role and approval check with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            checkUserStatus(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsApproved(false);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkUserStatus(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    try {
      // Check admin role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (roleError) {
        console.error("Error checking admin role:", roleError);
      }
      
      const userIsAdmin = !!roleData;
      setIsAdmin(userIsAdmin);

      // If admin, they're automatically approved
      if (userIsAdmin) {
        setIsApproved(true);
      } else {
        // Check approval status from profiles
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("is_approved")
          .eq("id", userId)
          .maybeSingle();

        if (profileError) {
          console.error("Error checking approval status:", profileError);
          setIsApproved(false);
        } else {
          setIsApproved(profileData?.is_approved ?? false);
        }
      }
    } catch (err) {
      console.error("Error checking user status:", err);
      setIsAdmin(false);
      setIsApproved(false);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error as Error };
    }

    // Check if MFA is required
    if (data.session) {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedFactors = factorsData?.totp.filter(f => f.status === 'verified') || [];
      
      if (verifiedFactors.length > 0) {
        // MFA is enabled - require verification
        const factor = verifiedFactors[0];
        setMfaChallenge({ factorId: factor.id });
        return { error: null, mfaRequired: true, factorId: factor.id };
      }
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    // Create profile with is_approved = false (default)
    if (!error && data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: email,
        full_name: fullName,
        is_approved: false,
      });
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setIsApproved(false);
    setMfaChallenge(null);
    setHas2FAEnabled(false);
  };

  const completeMFAChallenge = () => {
    setMfaChallenge(null);
  };

  const cancelMFAChallenge = async () => {
    setMfaChallenge(null);
    await supabase.auth.signOut();
  };

  const check2FAStatus = async (): Promise<boolean> => {
    try {
      const { data: factorsData, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error("Error checking 2FA status:", error);
        return false;
      }
      
      const verifiedFactors = factorsData?.totp.filter(f => f.status === 'verified') || [];
      const enabled = verifiedFactors.length > 0;
      setHas2FAEnabled(enabled);
      return enabled;
    } catch (err) {
      console.error("Error checking 2FA status:", err);
      return false;
    }
  };

  // Computed property: user is pending if logged in but not approved (and not admin)
  const isPendingApproval = !!user && !isApproved && !isAdmin && !isLoading;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin,
        isApproved,
        isPendingApproval,
        isLoading,
        mfaChallenge,
        has2FAEnabled,
        signIn,
        signUp,
        signOut,
        completeMFAChallenge,
        cancelMFAChallenge,
        check2FAStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
