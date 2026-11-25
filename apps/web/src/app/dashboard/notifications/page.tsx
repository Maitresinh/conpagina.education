"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Mail, Save } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Preferences = { emailFrequency: "off" | "immediate" | "daily"; newComments: boolean; replies: boolean; groupIds: string[] };

export default function NotificationSettings() {
  const query = useQuery(trpc.notifications.getPreferences.queryOptions());
  const groups = useQuery(trpc.groups.list.queryOptions());
  const mutation = useMutation(trpc.notifications.updatePreferences.mutationOptions());
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [selectedOnly, setSelectedOnly] = useState<boolean | null>(null);
  if (query.isPending) return <p className="p-6">Chargement des alertes…</p>;
  if (!query.data) return <p className="p-6">Impossible de charger les réglages. <button onClick={() => query.refetch()}>Réessayer</button></p>;
  const prefs = draft || query.data.preferences;
  const limited = selectedOnly ?? prefs.groupIds.length > 0;
  const update = (change: Partial<Preferences>) => setDraft({ ...prefs, ...change });
  const save = async () => {
    if (limited && !prefs.groupIds.length) { toast.error("Sélectionnez au moins une classe ou choisissez toutes les classes."); return; }
    try {
      await mutation.mutateAsync({ ...prefs, groupIds: limited ? prefs.groupIds : [] });
      await query.refetch(); setDraft(null); toast.success("Réglages des alertes enregistrés");
    } catch { toast.error("Les réglages n’ont pas pu être enregistrés."); }
  };
  return <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
    <h1 className="flex items-center gap-3 text-2xl font-semibold"><Bell aria-hidden="true" /> Alertes de lecture</h1>
    <p>Recevez les commentaires complets et les passages cités. Chaque message comporte les boutons <strong>↩ Répondre</strong> et <strong>📖 Ouvrir le livre</strong>.</p>
    <p className="flex items-center gap-2"><Mail aria-hidden="true" size={18} /> Adresse de réception : <strong>{query.data.email}</strong></p>
    {!query.data.serviceEnabled && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950">L’envoi des courriels n’est pas encore activé sur ce serveur. Vous pouvez enregistrer vos préférences.</p>}
    <section className="space-y-5 rounded-xl border p-5">
      <label className="block space-y-2"><span className="font-medium">Fréquence des courriels</span>
        <select className="block w-full rounded border bg-background p-3" value={prefs.emailFrequency} onChange={e => update({ emailFrequency: e.target.value as Preferences["emailFrequency"] })}>
          <option value="off">Désactivés</option><option value="immediate">À chaque nouveau commentaire</option><option value="daily">Récapitulatif quotidien à 9 h (heure de Paris)</option>
        </select>
      </label>
      <fieldset className="space-y-3"><legend className="mb-2 font-medium">Contenu des alertes</legend>
        <label className="flex gap-3"><input type="checkbox" checked={prefs.newComments} onChange={e => update({ newComments: e.target.checked })} /> Nouveaux commentaires sur les passages</label>
        <label className="flex gap-3"><input type="checkbox" checked={prefs.replies} onChange={e => update({ replies: e.target.checked })} /> Réponses dans les discussions</label>
      </fieldset>
      <fieldset className="space-y-3"><legend className="mb-2 font-medium">Classes et clubs suivis</legend>
        <label className="flex gap-3"><input type="radio" name="scope" checked={!limited} onChange={() => setSelectedOnly(false)} /> Toutes mes classes et tous mes clubs</label>
        <label className="flex gap-3"><input type="radio" name="scope" checked={limited} onChange={() => setSelectedOnly(true)} /> Uniquement ma sélection</label>
        {limited && <div className="space-y-3 pl-5">{groups.data?.map(g => <label key={g.id} className="flex gap-3"><input type="checkbox" checked={prefs.groupIds.includes(g.id)} onChange={e => update({ groupIds: e.target.checked ? [...prefs.groupIds, g.id] : prefs.groupIds.filter(id => id !== g.id) })} />{g.name}</label>)}</div>}
      </fieldset>
      <p className="text-sm text-muted-foreground">Vos propres commentaires et les annotations privées ne sont pas envoyés. Le bouton Répondre ouvre la discussion dans Conpagina.</p>
      <Button onClick={save} disabled={mutation.isPending}><Save aria-hidden="true" className="mr-2 h-4 w-4" />{mutation.isPending ? "Enregistrement…" : "Enregistrer les préférences"}</Button>
    </section>
    {query.data.latestDelivery && <p className="text-sm text-muted-foreground">Dernière alerte : {({ pending: "en attente d’envoi", sent: "acceptée par le service de courriel", cancelled: "annulée selon vos réglages ou vos accès", failed: "échec — contactez l’administrateur" } as Record<string, string>)[query.data.latestDelivery.status] || query.data.latestDelivery.status}.</p>}
  </main>;
}
