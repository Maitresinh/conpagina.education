import { z } from "zod";
import {
    db,
    systemConfig,
    sql,
} from "@lectio/db";
import { publicProcedure, adminProcedure, router } from "../index";

// Clés de configuration du site
export const SITE_CONFIG_KEYS = {
    // Apparence
    SITE_NAME: "site_name",
    SITE_LOGO: "site_logo",
    SITE_LOGO_INVERT: "site_logo_invert",
    SITE_LOGO_ZOOM: "site_logo_zoom",
    SITE_TAGLINE: "site_tagline",
    SITE_SUBTITLE: "site_subtitle",
    CTA_TITLE: "cta_title",
    CTA_DESCRIPTION: "cta_description",
    // Homepage features (JSON array of enabled feature keys)
    HOMEPAGE_FEATURES: "homepage_features",
    // Textes personnalisables des features
    FEATURE_EPUB_TITLE: "feature_epub_title",
    FEATURE_EPUB_DESCRIPTION: "feature_epub_description",
    FEATURE_ANNOTATIONS_TITLE: "feature_annotations_title",
    FEATURE_ANNOTATIONS_DESCRIPTION: "feature_annotations_description",
    FEATURE_DISCUSSIONS_TITLE: "feature_discussions_title",
    FEATURE_DISCUSSIONS_DESCRIPTION: "feature_discussions_description",
    FEATURE_GROUPS_TITLE: "feature_groups_title",
    FEATURE_GROUPS_DESCRIPTION: "feature_groups_description",
    FEATURE_PROGRESS_TITLE: "feature_progress_title",
    FEATURE_PROGRESS_DESCRIPTION: "feature_progress_description",
    FEATURE_CUSTOMIZATION_TITLE: "feature_customization_title",
    FEATURE_CUSTOMIZATION_DESCRIPTION: "feature_customization_description",
    // Informations légales - Impressum
    LEGAL_COMPANY_NAME: "legal_company_name",
    LEGAL_COMPANY_TYPE: "legal_company_type",
    LEGAL_ADDRESS: "legal_address",
    LEGAL_PHONE: "legal_phone",
    LEGAL_EMAIL: "legal_email",
    LEGAL_DIRECTOR: "legal_director",
    // Hébergeur
    LEGAL_HOST_NAME: "legal_host_name",
    LEGAL_HOST_ADDRESS: "legal_host_address",
    LEGAL_HOST_PHONE: "legal_host_phone",
    LEGAL_HOST_WEBSITE: "legal_host_website",
    // Contact
    CONTACT_EMAIL: "contact_email",
    CONTACT_SUPPORT_EMAIL: "contact_support_email",
    // RGPD
    GDPR_TEXT: "gdpr_text",
} as const;

// Features disponibles pour la homepage
export const HOMEPAGE_FEATURE_KEYS = {
    EPUB: "epub",
    ANNOTATIONS: "annotations",
    DISCUSSIONS: "discussions",
    GROUPS: "groups",
    PROGRESS: "progress",
    CUSTOMIZATION: "customization",
} as const;

// Valeurs par défaut
const DEFAULT_CONFIG: Record<string, string> = {
    [SITE_CONFIG_KEYS.SITE_NAME]: "Conpagina",
    [SITE_CONFIG_KEYS.SITE_LOGO]: "/logo_conpagina.png",
    [SITE_CONFIG_KEYS.SITE_LOGO_INVERT]: "true",
    [SITE_CONFIG_KEYS.SITE_LOGO_ZOOM]: "100",
    [SITE_CONFIG_KEYS.SITE_TAGLINE]: "Plateforme de lecture collaborative.",
    [SITE_CONFIG_KEYS.SITE_SUBTITLE]: "Lisez, annotez et discutez ensemble.",
    [SITE_CONFIG_KEYS.CTA_TITLE]: "Prêt à commencer ?",
    [SITE_CONFIG_KEYS.CTA_DESCRIPTION]: "Créez votre compte gratuitement et commencez à lire.",
    // Features par défaut (tous activés)
    [SITE_CONFIG_KEYS.HOMEPAGE_FEATURES]: JSON.stringify(Object.values(HOMEPAGE_FEATURE_KEYS)),
    // Textes par défaut des features
    [SITE_CONFIG_KEYS.FEATURE_EPUB_TITLE]: "Livres EPUB",
    [SITE_CONFIG_KEYS.FEATURE_EPUB_DESCRIPTION]: "Importez et lisez vos livres numériques directement dans le navigateur.",
    [SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_TITLE]: "Annotations",
    [SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_DESCRIPTION]: "Surlignez les passages importants et ajoutez vos commentaires.",
    [SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_TITLE]: "Discussions",
    [SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_DESCRIPTION]: "Créez des threads de discussion sur n'importe quelle annotation.",
    [SITE_CONFIG_KEYS.FEATURE_GROUPS_TITLE]: "Classes & Clubs",
    [SITE_CONFIG_KEYS.FEATURE_GROUPS_DESCRIPTION]: "Organisez vos élèves en groupes pour la lecture collaborative.",
    [SITE_CONFIG_KEYS.FEATURE_PROGRESS_TITLE]: "Progression",
    [SITE_CONFIG_KEYS.FEATURE_PROGRESS_DESCRIPTION]: "Suivez automatiquement votre avancement dans chaque livre.",
    [SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_TITLE]: "Personnalisation",
    [SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_DESCRIPTION]: "Thèmes, polices et taille de texte adaptés à votre confort.",
    // Informations légales par défaut
    [SITE_CONFIG_KEYS.LEGAL_COMPANY_NAME]: "Editeur des confins de l'imaginaire",
    [SITE_CONFIG_KEYS.LEGAL_COMPANY_TYPE]: "Association loi 1901",
    [SITE_CONFIG_KEYS.LEGAL_ADDRESS]: "740 ch du neplier 38380 St Laurent du pont",
    [SITE_CONFIG_KEYS.LEGAL_PHONE]: "0033 (0)768592250",
    [SITE_CONFIG_KEYS.LEGAL_EMAIL]: "pdapelo@gmail.com",
    [SITE_CONFIG_KEYS.LEGAL_DIRECTOR]: "Philippe Dapelo",
    [SITE_CONFIG_KEYS.LEGAL_HOST_NAME]: "OVH SAS",
    [SITE_CONFIG_KEYS.LEGAL_HOST_ADDRESS]: "2 rue Kellermann, 59100 Roubaix, France",
    [SITE_CONFIG_KEYS.LEGAL_HOST_PHONE]: "1007",
    [SITE_CONFIG_KEYS.LEGAL_HOST_WEBSITE]: "https://www.ovh.com",
    [SITE_CONFIG_KEYS.CONTACT_EMAIL]: "pdapelo@gmail.com",
    [SITE_CONFIG_KEYS.CONTACT_SUPPORT_EMAIL]: "pdapelo@gmail.com",
    [SITE_CONFIG_KEYS.GDPR_TEXT]: `# Politique de protection des données personnelles (RGPD)

## 1. Collecte des données
Nous collectons les données suivantes :
- Nom et prénom
- Adresse email
- Données de navigation et d'utilisation de la plateforme

## 2. Utilisation des données
Vos données sont utilisées pour :
- Créer et gérer votre compte utilisateur
- Vous permettre d'accéder aux fonctionnalités de lecture et d'annotation
- Améliorer nos services

## 3. Conservation des données
Vos données sont conservées pendant toute la durée de votre utilisation du service et supprimées sur demande.

## 4. Vos droits
Conformément au RGPD, vous disposez des droits suivants :
- Droit d'accès à vos données
- Droit de rectification
- Droit à l'effacement
- Droit à la portabilité
- Droit d'opposition

Pour exercer ces droits, contactez-nous à l'adresse indiquée dans les mentions légales.`,
};

// Helper pour récupérer toutes les configs
async function getConfigMap() {
    const configs = await db
        .select()
        .from(systemConfig)
        .where(
            sql`${systemConfig.key} IN (${sql.join(
                Object.values(SITE_CONFIG_KEYS).map((k) => sql`${k}`),
                sql`, `
            )})`
        );

    const configMap: Record<string, string> = { ...DEFAULT_CONFIG };
    for (const config of configs) {
        configMap[config.key] = config.value;
    }
    return configMap;
}

export const siteRouter = router({
    // Récupérer la configuration publique du site
    getPublicConfig: publicProcedure.query(async () => {
        const configMap = await getConfigMap();

        return {
            siteName: configMap[SITE_CONFIG_KEYS.SITE_NAME],
            siteLogo: configMap[SITE_CONFIG_KEYS.SITE_LOGO],
            siteLogoInvert: configMap[SITE_CONFIG_KEYS.SITE_LOGO_INVERT] === "true",
            siteLogoZoom: parseInt(configMap[SITE_CONFIG_KEYS.SITE_LOGO_ZOOM] ?? "100", 10),
            siteTagline: configMap[SITE_CONFIG_KEYS.SITE_TAGLINE],
            siteSubtitle: configMap[SITE_CONFIG_KEYS.SITE_SUBTITLE],
            ctaTitle: configMap[SITE_CONFIG_KEYS.CTA_TITLE],
            ctaDescription: configMap[SITE_CONFIG_KEYS.CTA_DESCRIPTION],
            homepageFeatures: JSON.parse(configMap[SITE_CONFIG_KEYS.HOMEPAGE_FEATURES] || "[]") as string[],
            // Textes des features
            featureTexts: {
                epub: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_EPUB_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_EPUB_DESCRIPTION],
                },
                annotations: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_DESCRIPTION],
                },
                discussions: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_DESCRIPTION],
                },
                groups: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_GROUPS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_GROUPS_DESCRIPTION],
                },
                progress: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_PROGRESS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_PROGRESS_DESCRIPTION],
                },
                customization: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_DESCRIPTION],
                },
            },
        };
    }),

    // Récupérer les informations légales publiques
    getLegalConfig: publicProcedure.query(async () => {
        const configMap = await getConfigMap();

        return {
            companyName: configMap[SITE_CONFIG_KEYS.LEGAL_COMPANY_NAME],
            companyType: configMap[SITE_CONFIG_KEYS.LEGAL_COMPANY_TYPE],
            address: configMap[SITE_CONFIG_KEYS.LEGAL_ADDRESS],
            phone: configMap[SITE_CONFIG_KEYS.LEGAL_PHONE],
            email: configMap[SITE_CONFIG_KEYS.LEGAL_EMAIL],
            director: configMap[SITE_CONFIG_KEYS.LEGAL_DIRECTOR],
            hostName: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_NAME],
            hostAddress: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_ADDRESS],
            hostPhone: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_PHONE],
            hostWebsite: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_WEBSITE],
            contactEmail: configMap[SITE_CONFIG_KEYS.CONTACT_EMAIL],
            supportEmail: configMap[SITE_CONFIG_KEYS.CONTACT_SUPPORT_EMAIL],
        };
    }),

    // Récupérer le texte RGPD (public - pour l'inscription)
    getGdprText: publicProcedure.query(async () => {
        const configMap = await getConfigMap();
        return {
            gdprText: configMap[SITE_CONFIG_KEYS.GDPR_TEXT],
        };
    }),

    // Mettre à jour la configuration du site (admin only)
    updateConfig: adminProcedure
        .input(
            z.object({
                // Apparence
                siteName: z.string().min(1).max(100).optional(),
                siteLogo: z.string().optional(),
                siteLogoInvert: z.boolean().optional(),
                siteLogoZoom: z.number().min(50).max(200).optional(),
                siteTagline: z.string().max(200).optional(),
                siteSubtitle: z.string().max(200).optional(),
                ctaTitle: z.string().max(100).optional(),
                ctaDescription: z.string().max(300).optional(),
                // Homepage features
                homepageFeatures: z.array(z.string()).optional(),
                // Textes des features
                featureTexts: z.object({
                    epub: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                    annotations: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                    discussions: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                    groups: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                    progress: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                    customization: z.object({ title: z.string().max(100), description: z.string().max(300) }).optional(),
                }).optional(),
            })
        )
        .mutation(async ({ input }) => {
            const updates: { key: string; value: string }[] = [];

            if (input.siteName !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_NAME, value: input.siteName });
            }
            if (input.siteLogo !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_LOGO, value: input.siteLogo });
            }
            if (input.siteLogoInvert !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_LOGO_INVERT, value: input.siteLogoInvert.toString() });
            }
            if (input.siteLogoZoom !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_LOGO_ZOOM, value: input.siteLogoZoom.toString() });
            }
            if (input.siteTagline !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_TAGLINE, value: input.siteTagline });
            }
            if (input.siteSubtitle !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.SITE_SUBTITLE, value: input.siteSubtitle });
            }
            if (input.ctaTitle !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.CTA_TITLE, value: input.ctaTitle });
            }
            if (input.ctaDescription !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.CTA_DESCRIPTION, value: input.ctaDescription });
            }
            if (input.homepageFeatures !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.HOMEPAGE_FEATURES, value: JSON.stringify(input.homepageFeatures) });
            }
            // Textes des features
            if (input.featureTexts?.epub) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_EPUB_TITLE, value: input.featureTexts.epub.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_EPUB_DESCRIPTION, value: input.featureTexts.epub.description });
            }
            if (input.featureTexts?.annotations) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_TITLE, value: input.featureTexts.annotations.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_DESCRIPTION, value: input.featureTexts.annotations.description });
            }
            if (input.featureTexts?.discussions) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_TITLE, value: input.featureTexts.discussions.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_DESCRIPTION, value: input.featureTexts.discussions.description });
            }
            if (input.featureTexts?.groups) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_GROUPS_TITLE, value: input.featureTexts.groups.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_GROUPS_DESCRIPTION, value: input.featureTexts.groups.description });
            }
            if (input.featureTexts?.progress) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_PROGRESS_TITLE, value: input.featureTexts.progress.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_PROGRESS_DESCRIPTION, value: input.featureTexts.progress.description });
            }
            if (input.featureTexts?.customization) {
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_TITLE, value: input.featureTexts.customization.title });
                updates.push({ key: SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_DESCRIPTION, value: input.featureTexts.customization.description });
            }

            // Upsert chaque configuration
            for (const update of updates) {
                await db
                    .insert(systemConfig)
                    .values({
                        key: update.key,
                        value: update.value,
                    })
                    .onConflictDoUpdate({
                        target: systemConfig.key,
                        set: {
                            value: update.value,
                        },
                    });
            }

            return { success: true };
        }),

    // Mettre à jour les informations légales (admin only)
    updateLegalConfig: adminProcedure
        .input(
            z.object({
                companyName: z.string().max(200).optional(),
                companyType: z.string().max(100).optional(),
                address: z.string().max(500).optional(),
                phone: z.string().max(50).optional(),
                email: z.string().email().optional(),
                director: z.string().max(200).optional(),
                hostName: z.string().max(200).optional(),
                hostAddress: z.string().max(500).optional(),
                hostPhone: z.string().max(50).optional(),
                hostWebsite: z.string().max(200).optional(),
                contactEmail: z.string().email().optional(),
                supportEmail: z.string().email().optional(),
                gdprText: z.string().max(10000).optional(),
            })
        )
        .mutation(async ({ input }) => {
            const updates: { key: string; value: string }[] = [];

            if (input.companyName !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_COMPANY_NAME, value: input.companyName });
            }
            if (input.companyType !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_COMPANY_TYPE, value: input.companyType });
            }
            if (input.address !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_ADDRESS, value: input.address });
            }
            if (input.phone !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_PHONE, value: input.phone });
            }
            if (input.email !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_EMAIL, value: input.email });
            }
            if (input.director !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_DIRECTOR, value: input.director });
            }
            if (input.hostName !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_HOST_NAME, value: input.hostName });
            }
            if (input.hostAddress !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_HOST_ADDRESS, value: input.hostAddress });
            }
            if (input.hostPhone !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_HOST_PHONE, value: input.hostPhone });
            }
            if (input.hostWebsite !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.LEGAL_HOST_WEBSITE, value: input.hostWebsite });
            }
            if (input.contactEmail !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.CONTACT_EMAIL, value: input.contactEmail });
            }
            if (input.supportEmail !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.CONTACT_SUPPORT_EMAIL, value: input.supportEmail });
            }
            if (input.gdprText !== undefined) {
                updates.push({ key: SITE_CONFIG_KEYS.GDPR_TEXT, value: input.gdprText });
            }

            for (const update of updates) {
                await db
                    .insert(systemConfig)
                    .values({
                        key: update.key,
                        value: update.value,
                    })
                    .onConflictDoUpdate({
                        target: systemConfig.key,
                        set: {
                            value: update.value,
                        },
                    });
            }

            return { success: true };
        }),

    // Récupérer toutes les configurations (admin only) - pour le formulaire d'édition
    getAllConfigs: adminProcedure.query(async () => {
        const configMap = await getConfigMap();

        return {
            // Apparence
            siteName: configMap[SITE_CONFIG_KEYS.SITE_NAME],
            siteLogo: configMap[SITE_CONFIG_KEYS.SITE_LOGO],
            siteLogoInvert: configMap[SITE_CONFIG_KEYS.SITE_LOGO_INVERT] === "true",
            siteLogoZoom: parseInt(configMap[SITE_CONFIG_KEYS.SITE_LOGO_ZOOM] ?? "100", 10),
            siteTagline: configMap[SITE_CONFIG_KEYS.SITE_TAGLINE],
            siteSubtitle: configMap[SITE_CONFIG_KEYS.SITE_SUBTITLE],
            ctaTitle: configMap[SITE_CONFIG_KEYS.CTA_TITLE],
            ctaDescription: configMap[SITE_CONFIG_KEYS.CTA_DESCRIPTION],
            // Homepage features
            homepageFeatures: JSON.parse(configMap[SITE_CONFIG_KEYS.HOMEPAGE_FEATURES] || "[]") as string[],
            // Textes des features
            featureTexts: {
                epub: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_EPUB_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_EPUB_DESCRIPTION],
                },
                annotations: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_ANNOTATIONS_DESCRIPTION],
                },
                discussions: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_DISCUSSIONS_DESCRIPTION],
                },
                groups: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_GROUPS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_GROUPS_DESCRIPTION],
                },
                progress: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_PROGRESS_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_PROGRESS_DESCRIPTION],
                },
                customization: {
                    title: configMap[SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_TITLE],
                    description: configMap[SITE_CONFIG_KEYS.FEATURE_CUSTOMIZATION_DESCRIPTION],
                },
            },
            // Informations légales
            legalCompanyName: configMap[SITE_CONFIG_KEYS.LEGAL_COMPANY_NAME],
            legalCompanyType: configMap[SITE_CONFIG_KEYS.LEGAL_COMPANY_TYPE],
            legalAddress: configMap[SITE_CONFIG_KEYS.LEGAL_ADDRESS],
            legalPhone: configMap[SITE_CONFIG_KEYS.LEGAL_PHONE],
            legalEmail: configMap[SITE_CONFIG_KEYS.LEGAL_EMAIL],
            legalDirector: configMap[SITE_CONFIG_KEYS.LEGAL_DIRECTOR],
            legalHostName: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_NAME],
            legalHostAddress: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_ADDRESS],
            legalHostPhone: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_PHONE],
            legalHostWebsite: configMap[SITE_CONFIG_KEYS.LEGAL_HOST_WEBSITE],
            contactEmail: configMap[SITE_CONFIG_KEYS.CONTACT_EMAIL],
            contactSupportEmail: configMap[SITE_CONFIG_KEYS.CONTACT_SUPPORT_EMAIL],
            // RGPD
            gdprText: configMap[SITE_CONFIG_KEYS.GDPR_TEXT],
        };
    }),
});
