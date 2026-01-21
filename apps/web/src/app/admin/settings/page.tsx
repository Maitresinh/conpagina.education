"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Settings, Upload, Save, Loader2, Image as ImageIcon, RefreshCw, ZoomIn, Sun, Moon,
    BookOpen, Highlighter, MessageSquare, Users, BarChart3, Palette, Eye, EyeOff,
    Building2, Phone, Mail, Globe, User, MapPin, Shield, Pencil, X, Check, FileText
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// Configuration statique des features (icône et couleur uniquement)
const FEATURE_CONFIG = {
    epub: { icon: BookOpen, color: "text-blue-500" },
    annotations: { icon: Highlighter, color: "text-yellow-500" },
    discussions: { icon: MessageSquare, color: "text-green-500" },
    groups: { icon: Users, color: "text-purple-500" },
    progress: { icon: BarChart3, color: "text-orange-500" },
    customization: { icon: Palette, color: "text-pink-500" },
} as const;

type FeatureKey = keyof typeof FEATURE_CONFIG;

interface FeatureTexts {
    [key: string]: { title: string; description: string };
}

const DEFAULT_FEATURE_TEXTS: FeatureTexts = {
    epub: { title: "Livres EPUB", description: "Importez et lisez vos livres numériques directement dans le navigateur." },
    annotations: { title: "Annotations", description: "Surlignez les passages importants et ajoutez vos commentaires." },
    discussions: { title: "Discussions", description: "Créez des threads de discussion sur n'importe quelle annotation." },
    groups: { title: "Classes & Clubs", description: "Organisez vos élèves en groupes pour la lecture collaborative." },
    progress: { title: "Progression", description: "Suivez automatiquement votre avancement dans chaque livre." },
    customization: { title: "Personnalisation", description: "Thèmes, polices et taille de texte adaptés à votre confort." },
};

// Composant pour édition inline de texte
function InlineEdit({
    value,
    onChange,
    placeholder,
    className = "",
    multiline = false,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    className?: string;
    multiline?: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        setTempValue(value);
    }, [value]);

    const handleSave = () => {
        onChange(tempValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTempValue(value);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) {
            handleSave();
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1 w-full">
                {multiline ? (
                    <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSave}
                        placeholder={placeholder}
                        rows={2}
                        className={`flex-1 bg-background border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none ${className}`}
                    />
                ) : (
                    <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        type="text"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSave}
                        placeholder={placeholder}
                        className={`flex-1 bg-background border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
                    />
                )}
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`cursor-pointer hover:bg-primary/10 rounded px-2 py-1 -mx-2 -my-1 transition-colors group flex items-center gap-2 ${className}`}
        >
            <span className={value ? "" : "text-muted-foreground/50 italic"}>
                {value || placeholder}
            </span>
            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
        </div>
    );
}

export default function AdminSettingsPage() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Récupérer la configuration actuelle
    const { data: config, isLoading } = useQuery(trpc.site.getAllConfigs.queryOptions());

    // État du formulaire - Apparence + Homepage
    const [formData, setFormData] = useState({
        siteName: "",
        siteLogo: "",
        siteLogoInvert: true,
        siteLogoZoom: 100,
        siteTagline: "",
        siteSubtitle: "",
        ctaTitle: "",
        ctaDescription: "",
        homepageFeatures: [] as string[],
        featureTexts: DEFAULT_FEATURE_TEXTS as FeatureTexts,
    });

    // État du formulaire - Legal
    const [legalData, setLegalData] = useState({
        companyName: "",
        companyType: "",
        address: "",
        phone: "",
        email: "",
        director: "",
        hostName: "",
        hostAddress: "",
        hostPhone: "",
        hostWebsite: "",
        contactEmail: "",
        supportEmail: "",
        gdprText: "",
    });

    // État pour le preview du logo uploadé
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [showLogoSettings, setShowLogoSettings] = useState(false);

    // Charger les données dans le formulaire quand elles arrivent
    useEffect(() => {
        if (config) {
            setFormData({
                siteName: config.siteName,
                siteLogo: config.siteLogo,
                siteLogoInvert: config.siteLogoInvert,
                siteLogoZoom: config.siteLogoZoom,
                siteTagline: config.siteTagline,
                siteSubtitle: config.siteSubtitle,
                ctaTitle: config.ctaTitle,
                ctaDescription: config.ctaDescription,
                homepageFeatures: config.homepageFeatures || Object.keys(FEATURE_CONFIG),
                featureTexts: config.featureTexts || DEFAULT_FEATURE_TEXTS,
            });
            setLegalData({
                companyName: config.legalCompanyName,
                companyType: config.legalCompanyType,
                address: config.legalAddress,
                phone: config.legalPhone,
                email: config.legalEmail,
                director: config.legalDirector,
                hostName: config.legalHostName,
                hostAddress: config.legalHostAddress,
                hostPhone: config.legalHostPhone,
                hostWebsite: config.legalHostWebsite,
                contactEmail: config.contactEmail,
                supportEmail: config.contactSupportEmail,
                gdprText: config.gdprText,
            });
        }
    }, [config]);

    // Mutation pour sauvegarder homepage config
    const updateConfigMutation = useMutation({
        ...trpc.site.updateConfig.mutationOptions(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["site"] });
            toast.success("Paramètres enregistrés", {
                description: "Les modifications ont été appliquées avec succès.",
            });
        },
        onError: (error) => {
            toast.error("Erreur", {
                description: error.message || "Impossible d'enregistrer les paramètres.",
            });
        },
    });

    // Mutation pour sauvegarder legal
    const updateLegalMutation = useMutation({
        ...trpc.site.updateLegalConfig.mutationOptions(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["site"] });
            toast.success("Informations légales enregistrées", {
                description: "Les modifications ont été appliquées avec succès.",
            });
        },
        onError: (error) => {
            toast.error("Erreur", {
                description: error.message || "Impossible d'enregistrer les informations.",
            });
        },
    });

    const handleFormChange = (field: keyof typeof formData, value: string | boolean | number | string[] | FeatureTexts) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleFeatureTextChange = (featureKey: string, field: "title" | "description", value: string) => {
        setFormData((prev) => ({
            ...prev,
            featureTexts: {
                ...prev.featureTexts,
                [featureKey]: {
                    ...prev.featureTexts[featureKey],
                    [field]: value,
                },
            },
        }));
    };

    const handleLegalChange = (field: keyof typeof legalData, value: string) => {
        setLegalData((prev) => ({ ...prev, [field]: value }));
    };

    const toggleFeature = (featureKey: string) => {
        setFormData(prev => ({
            ...prev,
            homepageFeatures: prev.homepageFeatures.includes(featureKey)
                ? prev.homepageFeatures.filter(k => k !== featureKey)
                : [...prev.homepageFeatures, featureKey]
        }));
    };

    const handleSaveHomepage = async (e: React.FormEvent) => {
        e.preventDefault();
        await updateConfigMutation.mutateAsync(formData);
    };

    const handleSaveLegal = async (e: React.FormEvent) => {
        e.preventDefault();
        await updateLegalMutation.mutateAsync(legalData);
    };

    // Gestion de l'upload de logo
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            setLogoPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);

        setUploadingLogo(true);

        try {
            const formDataUpload = new FormData();
            formDataUpload.append("file", file);

            const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
            const response = await fetch(`${serverUrl}/api/upload/image`, {
                method: "POST",
                body: formDataUpload,
                credentials: "include",
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Upload failed");
            }

            const { url } = await response.json();
            handleFormChange("siteLogo", `${serverUrl}${url}`);
            setLogoPreview(null);
            toast.success("Logo uploadé");
        } catch (error) {
            setLogoPreview(null);
            toast.error("Erreur d'upload", {
                description: error instanceof Error ? error.message : "Erreur lors de l'upload du logo",
            });
        } finally {
            setUploadingLogo(false);
        }
    };

    const logoScale = formData.siteLogoZoom / 100;
    const logoSrc = logoPreview || formData.siteLogo;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Settings className="h-8 w-8" />
                        Paramètres du site
                    </h1>
                    <p className="text-muted-foreground">
                        Personnalisez l'apparence et les informations légales
                    </p>
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-[500px] w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Settings className="h-8 w-8" />
                    Paramètres du site
                </h1>
                <p className="text-muted-foreground">
                    Personnalisez l'apparence et les informations légales
                </p>
            </div>

            <Tabs defaultValue="homepage" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 max-w-sm">
                    <TabsTrigger value="homepage" className="gap-2">
                        <Eye className="h-4 w-4" />
                        <span>Page d'accueil</span>
                    </TabsTrigger>
                    <TabsTrigger value="legal" className="gap-2">
                        <Shield className="h-4 w-4" />
                        <span>Légal</span>
                    </TabsTrigger>
                </TabsList>

                {/* Onglet Homepage - Éditeur visuel */}
                <TabsContent value="homepage">
                    <form onSubmit={handleSaveHomepage}>
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Eye className="h-5 w-5" />
                                            Éditeur visuel
                                        </CardTitle>
                                        <CardDescription>
                                            Cliquez directement sur les éléments pour les modifier.
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                if (config) {
                                                    setFormData({
                                                        siteName: config.siteName,
                                                        siteLogo: config.siteLogo,
                                                        siteLogoInvert: config.siteLogoInvert,
                                                        siteLogoZoom: config.siteLogoZoom,
                                                        siteTagline: config.siteTagline,
                                                        siteSubtitle: config.siteSubtitle,
                                                        ctaTitle: config.ctaTitle,
                                                        ctaDescription: config.ctaDescription,
                                                        homepageFeatures: config.homepageFeatures || Object.keys(FEATURE_CONFIG),
                                                        featureTexts: config.featureTexts || DEFAULT_FEATURE_TEXTS,
                                                    });
                                                    toast.info("Modifications annulées");
                                                }
                                            }}
                                        >
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Annuler
                                        </Button>
                                        <Button type="submit" size="sm" disabled={updateConfigMutation.isPending}>
                                            {updateConfigMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Save className="mr-2 h-4 w-4" />
                                            )}
                                            Enregistrer
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Preview éditable de la homepage */}
                                <div className="border-2 border-dashed border-primary/30 rounded-xl overflow-hidden bg-background">
                                    {/* Hero Section - Éditable */}
                                    <div className="flex flex-col items-center justify-center px-6 py-10 text-center border-b bg-muted/20">
                                        {/* Logo éditable */}
                                        <div className="relative mb-6 group">
                                            <div
                                                onClick={() => setShowLogoSettings(!showLogoSettings)}
                                                className="cursor-pointer relative"
                                            >
                                                <span className="absolute -top-2 -right-4 bg-black text-white dark:bg-white dark:text-black text-[10px] font-semibold px-1.5 py-0.5 rounded z-10">BETA</span>
                                                {logoSrc ? (
                                                    <div className="relative">
                                                        <img
                                                            src={logoSrc}
                                                            alt={formData.siteName}
                                                            className={`w-auto transition-transform ${formData.siteLogoInvert ? "dark:invert" : ""}`}
                                                            style={{ height: `${5 * logoScale}rem` }}
                                                        />
                                                        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                                                            <Pencil className="h-6 w-6 text-primary" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="h-20 w-40 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors">
                                                        <div className="text-center">
                                                            <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                                                            <span className="text-xs text-muted-foreground">Cliquez pour ajouter</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Panel de settings logo */}
                                            {showLogoSettings && (
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 bg-popover border rounded-lg shadow-lg p-4 w-80">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="font-medium text-sm">Paramètres du logo</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => setShowLogoSettings(false)}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>

                                                    {/* Preview mini clair/sombre */}
                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        <div className="rounded border bg-white p-2 flex items-center justify-center h-12">
                                                            <Sun className="h-3 w-3 text-gray-400 absolute top-1 left-1" />
                                                            {logoSrc && (
                                                                <img
                                                                    src={logoSrc}
                                                                    alt="Light"
                                                                    className="max-h-full max-w-full object-contain"
                                                                    style={{ transform: `scale(${logoScale * 0.5})` }}
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="rounded border bg-gray-900 p-2 flex items-center justify-center h-12">
                                                            <Moon className="h-3 w-3 text-gray-500 absolute top-1 left-1" />
                                                            {logoSrc && (
                                                                <img
                                                                    src={logoSrc}
                                                                    alt="Dark"
                                                                    className={`max-h-full max-w-full object-contain ${formData.siteLogoInvert ? "invert" : ""}`}
                                                                    style={{ transform: `scale(${logoScale * 0.5})` }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* URL ou Upload */}
                                                    <div className="flex gap-2 mb-3">
                                                        <Input
                                                            value={formData.siteLogo}
                                                            onChange={(e) => handleFormChange("siteLogo", e.target.value)}
                                                            placeholder="URL du logo"
                                                            className="flex-1 h-8 text-xs"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => fileInputRef.current?.click()}
                                                            disabled={uploadingLogo}
                                                        >
                                                            {uploadingLogo ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Upload className="h-3 w-3" />
                                                            )}
                                                        </Button>
                                                    </div>

                                                    {/* Taille */}
                                                    <div className="space-y-2 mb-3">
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-xs flex items-center gap-1">
                                                                <ZoomIn className="h-3 w-3" />
                                                                Taille
                                                            </Label>
                                                            <span className="text-xs text-muted-foreground">{formData.siteLogoZoom}%</span>
                                                        </div>
                                                        <Slider
                                                            value={[formData.siteLogoZoom]}
                                                            onValueChange={([value]) => handleFormChange("siteLogoZoom", value)}
                                                            min={50}
                                                            max={200}
                                                            step={5}
                                                            className="w-full"
                                                        />
                                                    </div>

                                                    {/* Inversion */}
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs cursor-pointer">
                                                            Inverser en mode sombre
                                                        </Label>
                                                        <Switch
                                                            checked={formData.siteLogoInvert}
                                                            onCheckedChange={(checked) => handleFormChange("siteLogoInvert", checked)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleLogoUpload}
                                            className="hidden"
                                        />

                                        {/* Tagline éditable */}
                                        <div className="max-w-xl w-full">
                                            <InlineEdit
                                                value={formData.siteTagline}
                                                onChange={(v) => handleFormChange("siteTagline", v)}
                                                placeholder="Slogan principal..."
                                                className="text-lg text-muted-foreground justify-center"
                                            />
                                        </div>

                                        {/* Subtitle éditable */}
                                        <div className="max-w-xl w-full mb-6">
                                            <InlineEdit
                                                value={formData.siteSubtitle}
                                                onChange={(v) => handleFormChange("siteSubtitle", v)}
                                                placeholder="Sous-titre..."
                                                className="text-lg text-muted-foreground justify-center"
                                            />
                                        </div>

                                        {/* Boutons (non éditables - juste preview) */}
                                        <div className="flex gap-2 opacity-60">
                                            <Button size="sm" disabled>Commencer</Button>
                                            <Button size="sm" variant="outline" disabled>En savoir plus</Button>
                                        </div>
                                    </div>

                                    {/* Features Section */}
                                    <div className="px-6 py-8">
                                        <h3 className="text-xl font-semibold text-center mb-2">Fonctionnalités</h3>
                                        <p className="text-xs text-center text-muted-foreground mb-6">
                                            Cliquez sur l'icone oeil pour afficher/masquer. Cliquez sur le texte pour le modifier.
                                        </p>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
                                            {(Object.keys(FEATURE_CONFIG) as FeatureKey[]).map((featureKey) => {
                                                const featureConfig = FEATURE_CONFIG[featureKey];
                                                const featureText = formData.featureTexts[featureKey] || DEFAULT_FEATURE_TEXTS[featureKey];
                                                const isEnabled = formData.homepageFeatures.includes(featureKey);
                                                const Icon = featureConfig.icon;
                                                return (
                                                    <div
                                                        key={featureKey}
                                                        className={`relative p-4 rounded-lg border-2 transition-all ${isEnabled
                                                            ? "border-primary bg-primary/5 shadow-sm"
                                                            : "border-dashed border-muted-foreground/30 opacity-40"
                                                            }`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleFeature(featureKey)}
                                                            className="absolute top-2 right-2 p-1 rounded hover:bg-muted transition-colors"
                                                            title={isEnabled ? "Masquer" : "Afficher"}
                                                        >
                                                            {isEnabled ? (
                                                                <Eye className="h-4 w-4 text-primary" />
                                                            ) : (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </button>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Icon className={`h-5 w-5 flex-shrink-0 ${isEnabled ? featureConfig.color : "text-muted-foreground"}`} />
                                                            <InlineEdit
                                                                value={featureText.title}
                                                                onChange={(v) => handleFeatureTextChange(featureKey, "title", v)}
                                                                placeholder="Titre..."
                                                                className="font-medium text-sm"
                                                            />
                                                        </div>
                                                        <InlineEdit
                                                            value={featureText.description}
                                                            onChange={(v) => handleFeatureTextChange(featureKey, "description", v)}
                                                            placeholder="Description..."
                                                            className="text-sm text-muted-foreground"
                                                            multiline
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* CTA Section - Éditable */}
                                    <div className="px-6 py-8 text-center border-t bg-muted/20">
                                        <div className="max-w-md mx-auto">
                                            <InlineEdit
                                                value={formData.ctaTitle}
                                                onChange={(v) => handleFormChange("ctaTitle", v)}
                                                placeholder="Titre d'appel à l'action..."
                                                className="text-xl font-semibold mb-2 justify-center"
                                            />
                                            <InlineEdit
                                                value={formData.ctaDescription}
                                                onChange={(v) => handleFormChange("ctaDescription", v)}
                                                placeholder="Description de l'appel à l'action..."
                                                className="text-muted-foreground mb-4 justify-center"
                                                multiline
                                            />
                                        </div>
                                        <Button size="sm" disabled className="opacity-60">Créer un compte</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                    </form>
                </TabsContent>

                {/* Onglet Legal */}
                <TabsContent value="legal">
                    <form onSubmit={handleSaveLegal} className="space-y-6">
                        {/* Impressum / Éditeur */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Building2 className="h-5 w-5" />
                                            Éditeur du site
                                        </CardTitle>
                                        <CardDescription>
                                            Informations affichées dans les mentions légales
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                if (config) {
                                                    setLegalData({
                                                        companyName: config.legalCompanyName,
                                                        companyType: config.legalCompanyType,
                                                        address: config.legalAddress,
                                                        phone: config.legalPhone,
                                                        email: config.legalEmail,
                                                        director: config.legalDirector,
                                                        hostName: config.legalHostName,
                                                        hostAddress: config.legalHostAddress,
                                                        hostPhone: config.legalHostPhone,
                                                        hostWebsite: config.legalHostWebsite,
                                                        contactEmail: config.contactEmail,
                                                        supportEmail: config.contactSupportEmail,
                                                        gdprText: config.gdprText,
                                                    });
                                                    toast.info("Formulaire réinitialisé");
                                                }
                                            }}
                                        >
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Réinitialiser
                                        </Button>
                                        <Button type="submit" size="sm" disabled={updateLegalMutation.isPending}>
                                            {updateLegalMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Save className="mr-2 h-4 w-4" />
                                            )}
                                            Enregistrer
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="companyName">Nom / Raison sociale</Label>
                                        <Input
                                            id="companyName"
                                            value={legalData.companyName}
                                            onChange={(e) => handleLegalChange("companyName", e.target.value)}
                                            placeholder="Nom de l'organisation"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="companyType">Forme juridique</Label>
                                        <Input
                                            id="companyType"
                                            value={legalData.companyType}
                                            onChange={(e) => handleLegalChange("companyType", e.target.value)}
                                            placeholder="Association loi 1901, SARL, etc."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address" className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        Adresse
                                    </Label>
                                    <Textarea
                                        id="address"
                                        value={legalData.address}
                                        onChange={(e) => handleLegalChange("address", e.target.value)}
                                        placeholder="Adresse complète"
                                        rows={2}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="flex items-center gap-2">
                                            <Phone className="h-4 w-4" />
                                            Téléphone
                                        </Label>
                                        <Input
                                            id="phone"
                                            value={legalData.phone}
                                            onChange={(e) => handleLegalChange("phone", e.target.value)}
                                            placeholder="+33 1 23 45 67 89"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="flex items-center gap-2">
                                            <Mail className="h-4 w-4" />
                                            Email
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={legalData.email}
                                            onChange={(e) => handleLegalChange("email", e.target.value)}
                                            placeholder="contact@exemple.com"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="director" className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Directeur de la publication
                                    </Label>
                                    <Input
                                        id="director"
                                        value={legalData.director}
                                        onChange={(e) => handleLegalChange("director", e.target.value)}
                                        placeholder="Prénom Nom"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Hébergeur */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Globe className="h-5 w-5" />
                                    Hébergeur
                                </CardTitle>
                                <CardDescription>
                                    Informations sur l'hébergement du site
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="hostName">Nom de l'hébergeur</Label>
                                        <Input
                                            id="hostName"
                                            value={legalData.hostName}
                                            onChange={(e) => handleLegalChange("hostName", e.target.value)}
                                            placeholder="OVH, AWS, etc."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="hostPhone">Téléphone</Label>
                                        <Input
                                            id="hostPhone"
                                            value={legalData.hostPhone}
                                            onChange={(e) => handleLegalChange("hostPhone", e.target.value)}
                                            placeholder="Numéro de contact"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="hostAddress">Adresse</Label>
                                    <Input
                                        id="hostAddress"
                                        value={legalData.hostAddress}
                                        onChange={(e) => handleLegalChange("hostAddress", e.target.value)}
                                        placeholder="Adresse de l'hébergeur"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="hostWebsite">Site web</Label>
                                    <Input
                                        id="hostWebsite"
                                        value={legalData.hostWebsite}
                                        onChange={(e) => handleLegalChange("hostWebsite", e.target.value)}
                                        placeholder="https://www.exemple.com"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Contact */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Mail className="h-5 w-5" />
                                    Contacts
                                </CardTitle>
                                <CardDescription>
                                    Adresses email affichées dans les pages RGPD et confidentialité
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="contactEmail">Email de contact principal</Label>
                                        <Input
                                            id="contactEmail"
                                            type="email"
                                            value={legalData.contactEmail}
                                            onChange={(e) => handleLegalChange("contactEmail", e.target.value)}
                                            placeholder="contact@exemple.com"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Pour les questions générales et RGPD
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="supportEmail">Email de support</Label>
                                        <Input
                                            id="supportEmail"
                                            type="email"
                                            value={legalData.supportEmail}
                                            onChange={(e) => handleLegalChange("supportEmail", e.target.value)}
                                            placeholder="support@exemple.com"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Pour l'assistance technique
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* RGPD */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FileText className="h-5 w-5" />
                                    Texte RGPD
                                </CardTitle>
                                <CardDescription>
                                    Texte affiché lors de l'inscription pour le consentement RGPD. Supporte le format Markdown.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <Label htmlFor="gdprText">Politique de protection des données</Label>
                                    <Textarea
                                        id="gdprText"
                                        value={legalData.gdprText}
                                        onChange={(e) => handleLegalChange("gdprText", e.target.value)}
                                        placeholder="# Politique RGPD&#10;&#10;Décrivez ici comment vous collectez et utilisez les données personnelles..."
                                        rows={15}
                                        className="font-mono text-sm"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Ce texte sera affiché dans une fenêtre modale lors de l'inscription. L'utilisateur devra l'accepter pour créer son compte.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                    </form>
                </TabsContent>
            </Tabs>
        </div>
    );
}
