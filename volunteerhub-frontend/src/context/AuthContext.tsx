import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "../types/auth";
import { getCurrentUser } from "../services/authApi";
import { AuthContext } from "./authContextDefinition";

 const isTokenValid = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));

    return (
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
};


const isUnauthorized = (error: unknown) =>
  error instanceof Error && "status" in error && error.status === 401;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();

  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem("accessToken");

    if (!savedToken) return null;

    if (!isTokenValid(savedToken)) {
      localStorage.removeItem("accessToken");
      return null;
    }

    return savedToken;
  });

  const { data: user, isPending, isFetching, error } = useQuery({
    queryKey: ["currentUser", token],
    queryFn: async () => {
      try {
        const response = await getCurrentUser(token!);
        return response.data;
      } catch (requestError) {
        if (isUnauthorized(requestError)) {
          localStorage.removeItem("accessToken");
        }
        throw requestError;
      }
    },
    enabled: token !== null,
    retry: false,
  });

  // A token the server rejected (401) counts as logged out. This is derived during render
  // instead of calling setToken(null) inside an effect (react-hooks/set-state-in-effect).
  const activeToken = isUnauthorized(error) ? null : token;

  const login = (newToken: string, user: User) => {
    localStorage.setItem("accessToken", newToken);
    queryClient.setQueryData(["currentUser", newToken], user);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    setToken(null);
    queryClient.removeQueries({ queryKey: ["currentUser"] });
    queryClient.removeQueries({ queryKey: ["myHelpRequests"] });
    // Offers include the accepted volunteer's contact details.
    queryClient.removeQueries({ queryKey: ["requestOffers"] });
  };

  const isLoading = activeToken !== null && isPending && isFetching;

  return (
    <AuthContext.Provider
      value={{
        token: activeToken,
        isAuthenticated: activeToken !== null,
        isLoading,
        user: user ?? null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};