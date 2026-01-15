import Link from "next/link";

export const metadata = {
    title: "Mentions Légales - Conpagina",
    description: "Mentions légales et informations juridiques",
};

export default function LegalPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Mentions Légales</h1>

            <p className="text-muted-foreground mb-8">
                Conformément aux dispositions de la loi n° 2004-575 du 21 juin 2004 pour la confiance
                en l'économie numérique, voici les informations relatives à l'éditeur et à l'hébergeur de ce site.
            </p>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">1. Éditeur du site</h2>
                <div className="text-muted-foreground space-y-2">
                    {/* TODO: Personnaliser avec les vraies informations */}

                    <p><strong>Nom / Raison sociale :</strong> Editeur des confins de l'imaginaire - Association loi 1901</p>
                    <p><strong>Adresse :</strong> 740 ch du neplier 38380 St Laurent du pont</p>
                    <p><strong>Téléphone :</strong> 0033 (0)768592250</p>
                    <p><strong>Directeur de la publication :</strong>Philippe Dapelo</p>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">2. Hébergeur</h2>
                <div className="text-muted-foreground space-y-2">
                    <p><strong>Nom :</strong> OVH SAS</p>
                    <p><strong>Adresse :</strong> 2 rue Kellermann, 59100 Roubaix, France</p>
                    <p><strong>Téléphone :</strong> 1007 (depuis la France) / +33 9 72 10 10 07 (international)</p>
                    <p><strong>Site web :</strong> <a href="https://www.ovh.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">www.ovh.com</a></p>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">3. Propriété intellectuelle</h2>
                <p className="text-muted-foreground">
                    L'ensemble du contenu de ce site (structure, textes, logos, images, vidéos, etc.)
                    est protégé par le droit d'auteur et le droit de propriété intellectuelle.
                    Toute reproduction, représentation, modification, publication, transmission,
                    ou plus généralement toute exploitation non autorisée du site ou de son contenu,
                    qu'elle soit totale ou partielle, est interdite, sauf autorisation écrite préalable.
                </p>
                <p className="text-muted-foreground mt-4">
                    Les livres et documents mis à disposition sur la plateforme restent la propriété
                    de leurs auteurs et éditeurs respectifs. Les utilisateurs s'engagent à respecter
                    les droits d'auteur applicables.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">4. Limitation de responsabilité</h2>
                <p className="text-muted-foreground">
                    L'éditeur du site s'efforce de fournir des informations aussi précises que possible.
                    Toutefois, il ne pourra être tenu responsable des omissions, des inexactitudes et
                    des carences dans la mise à jour, qu'elles soient de son fait ou du fait des tiers
                    partenaires qui lui fournissent ces informations.
                </p>
                <p className="text-muted-foreground mt-4">
                    L'éditeur ne saurait être tenu responsable des dommages directs ou indirects
                    résultant de l'accès au site ou de l'utilisation du site et/ou de l'impossibilité
                    d'y accéder.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">5. Données personnelles</h2>
                <p className="text-muted-foreground">
                    Pour toute information concernant le traitement de vos données personnelles,
                    veuillez consulter notre{" "}
                    <Link href={"/privacy" as any} className="text-primary hover:underline">
                        Politique de Confidentialité
                    </Link>.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">6. Cookies</h2>
                <p className="text-muted-foreground">
                    Ce site utilise des cookies strictement nécessaires au fonctionnement du service
                    (authentification, préférences utilisateur). Ces cookies ne collectent pas de données
                    personnelles à des fins publicitaires. Vous pouvez configurer votre navigateur pour
                    refuser les cookies, mais certaines fonctionnalités du site pourraient ne plus être disponibles.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">7. Loi applicable</h2>
                <p className="text-muted-foreground">
                    Les présentes mentions légales sont soumises au droit français.
                    En cas de litige, les tribunaux français seront seuls compétents.
                </p>
            </section>

            <div className="border-t pt-6 mt-8">
                <Link href="/" className="text-primary hover:underline">
                    ← Retour à l'accueil
                </Link>
            </div>
        </div>
    );
}
