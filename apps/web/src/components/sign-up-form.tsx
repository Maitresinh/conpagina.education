import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import Loader from "./loader";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const { isPending } = authClient.useSession();
  const [showGdprModal, setShowGdprModal] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);

  // Récupérer le texte RGPD
  const { data: gdprData } = useQuery(trpc.site.getGdprText.queryOptions());

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      // Vérifier que RGPD est accepté
      if (!gdprAccepted) {
        setShowGdprModal(true);
        return;
      }

      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
          // @ts-ignore - Better Auth will handle the role
          role: "STUDENT",
          callbackURL: "/email-verified",
        },
        {
          onSuccess: () => {
            toast.success(
              "Compte créé ! Vérifiez votre email pour activer votre compte.",
              { duration: 10000 }
            );
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
        email: z.string().email("Email invalide"),
        password: z.string()
          .min(12, "Le mot de passe doit contenir au moins 12 caractères")
          .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
          .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
          .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
      }),
    },
  });

  // Handler pour accepter les conditions RGPD et soumettre le formulaire
  const handleAcceptGdpr = () => {
    setGdprAccepted(true);
    setShowGdprModal(false);
    toast.success("Conditions acceptées");
    // Soumettre le formulaire après acceptation
    setTimeout(() => {
      form.handleSubmit();
    }, 100);
  };

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
      <h1 className="mb-6 text-center text-3xl font-bold">Créer un compte</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Nom</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500 text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

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
                  <p key={error?.message} className="text-red-500 text-sm">
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
                  <p key={error?.message} className="text-red-500 text-sm">
                    {error?.message}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground mt-1">
                  12 caractères minimum, avec majuscule, minuscule et chiffre
                </p>
              </div>
            )}
          </form.Field>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Vous êtes enseignant ?</strong> Après votre inscription, vous pourrez demander un compte enseignant sur <br /> <Link href="/dashboard/become-teacher" className="text-primary hover:underline">/dashboard/become-teacher</Link>.
          </p>
        </div>

        {/* Indicateur RGPD */}
        <label
          htmlFor="gdpr-accepted"
          className="flex gap-3 p-3 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <Checkbox
            id="gdpr-accepted"
            checked={gdprAccepted}
            onCheckedChange={() => {
              if (!gdprAccepted) {
                setShowGdprModal(true);
              }
            }}
            className="shrink-0"
          />
          <span className="text-sm">
            J'accepte les{" "}
            <Link href="/legal" className="text-primary hover:underline" target="_blank" onClick={(e) => e.stopPropagation()}>CGU</Link>,{" "}
            la <Link href="/privacy" className="text-primary hover:underline" target="_blank" onClick={(e) => e.stopPropagation()}>politique de confidentialité</Link>{" "}
            et la <button type="button" onClick={(e) => { e.preventDefault(); setShowGdprModal(true); }} className="text-primary hover:underline">politique RGPD</button>
            {gdprAccepted && <span className="text-green-600 font-medium"> (accepté)</span>}
          </span>
        </label>

        {/* Modal RGPD - Grande fenêtre popup */}
        <Dialog open={showGdprModal} onOpenChange={setShowGdprModal}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-2xl font-bold">
                Protection des données personnelles (RGPD)
              </DialogTitle>
              <DialogDescription className="text-base">
                Veuillez lire attentivement notre politique de protection des données personnelles avant de créer votre compte.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto py-6 px-2">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                {gdprData?.gdprText || "Chargement..."}
              </div>
            </div>
            <DialogFooter className="flex-shrink-0 pt-4 border-t gap-3 sm:gap-3">
              <Button variant="outline" size="lg" onClick={() => setShowGdprModal(false)}>
                Annuler
              </Button>
              <Button size="lg" onClick={handleAcceptGdpr}>
                J'ai lu et j'accepte les conditions
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? "Création..." : "Créer mon compte"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignIn}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Déjà un compte ? Se connecter
        </Button>
      </div>
    </div>
  );
}
