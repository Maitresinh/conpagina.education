import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [resendingEmail, setResendingEmail] = useState(false);

  const handleResendVerificationEmail = async (email: string) => {
    setResendingEmail(true);
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: "/dashboard",
      });
      toast.success("Email de vérification renvoyé ! Vérifiez votre boîte mail.");
    } catch {
      toast.error("Erreur lors de l'envoi de l'email. Veuillez réessayer.");
    } finally {
      setResendingEmail(false);
    }
  };

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            // Vérifier s'il y a une redirection stockée
            const redirectUrl = typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("next") || sessionStorage.getItem("redirectAfterLogin")
              : null;

            if (redirectUrl && redirectUrl.startsWith("/") && !redirectUrl.startsWith("//") && !redirectUrl.includes("\\")) {
              sessionStorage.removeItem("redirectAfterLogin");
              router.push(redirectUrl as any);
            } else {
              router.push("/dashboard" as any);
            }
            toast.success("Sign in successful");
          },
          onError: (error) => {
            if (error.error.status === 403) {
              toast.error(
                <div className="flex flex-col gap-2">
                  <span>Veuillez vérifier votre email avant de vous connecter</span>
                  <button
                    type="button"
                    onClick={() => handleResendVerificationEmail(value.email)}
                    disabled={resendingEmail}
                    className="text-sm underline hover:no-underline text-left"
                  >
                    {resendingEmail ? "Envoi en cours..." : "Renvoyer l'email de vérification"}
                  </button>
                </div>,
                { duration: 10000 }
              );
            } else {
              toast.error(error.error.message || error.error.statusText);
            }
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <div className="flex justify-center mb-6">
        <div className="relative">
          <span className="absolute -top-3 -right-6 z-10 bg-black text-white dark:bg-white dark:text-black text-xs font-semibold px-2 py-1 rounded">BETA</span>
          <img src="/logo_conpagina.png" alt="Conpagina" className="h-32 w-auto dark:invert" />
        </div>
      </div>
      <h1 className="mb-6 text-center text-3xl font-bold">Se connecter</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Mot de passe</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div className="text-right">
          <Link
            href={"/forgot-password" as any}
            className="text-sm text-muted-foreground hover:text-primary hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? "Connexion..." : "Se connecter"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Avez-vous besoin d'un compte ? S'inscrire
        </Button>
      </div>
    </div>
  );
}
