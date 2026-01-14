<div align="center">

# 📚 Conpagina Education

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Bun](https://img.shields.io/badge/Bun-1.3.5+-black?logo=bun)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)

**Alternative open source à Glose Education pour la lecture collective et l'annotation pédagogique**

[🇫🇷 Français](#-français) • [🇬🇧 English](#-english)

</div>

---

## 🇫🇷 Français

### À propos

**Conpagina Education** est une alternative open source à la défunte plateforme Glose Education. Elle permet la lecture collective, l'annotation et le travail pédagogique autour des textes. Ce dépôt est **public** et accepte des contributions dans le cadre d'une licence ouverte pour l'éducation.

### Architecture du projet

- **Conpagina Education** : public (ce dépôt) - branche éducative
- **Conpagina** : privé - projet principal

### 📖 La lecture sociale (Social Reading)

La lecture sociale tire pleinement parti de la nature dématérialisée des livres électroniques : la lecture continue d'être cette activité d'introspection solitaire qui fait tout son intérêt tout en bénéficiant des avantages de la mise en réseau. **Lire seuls mais ensemble.**

Concrètement, le lecteur d'un roman peut annoter d'un simple clic dans la marge, l'ensemble de ces notes étant visibles aux autres membres du groupe de lecture et pouvant faire l'objet de fils de discussion.

### 🎓 La lecture sociale dans le cadre de l'éducation

La maîtrise de l'expression écrite tient une place fondamentale dans l'éducation. Surtout en France où presque tous les examens, écrits et oraux, relèvent de la dissertation.

D'un autre côté, toutes les recherches en sociologie de l'éducation depuis soixante ans insistent sur le rôle déterminant de la socialisation à la lecture, qui se fait très inégalement selon l'origine sociale et des inégalités qui en découlent.

Or, les contraintes de la classe telle qu'elle est organisée ne permettent pas d'y remédier. Paradoxalement, au-delà de quelques textes épars, la lecture personnelle, riche, permettant une réappropriation est pratiquement absente. En outre, l'environnement contemporain réduit encore cette possibilité. D'une part, les pratiques de lecture, concurrencées par l'offre de divertissements, sont en baisse accélérée. D'autre part, faute de pouvoir accompagner les élèves dans les tâches de lecture à la maison, les livres sont de moins en moins lus et de plus en plus résumés par des chatbots IA.

**Conpagina Education** vise à réduire cette contradiction en :

- **Socialisant la lecture** : en lisant à plusieurs, en pouvant partager et donner leurs avis sur leur téléphone, la pratique de la lecture se rapproche des pratiques existantes
- **Permettant l'accompagnement** : les élèves à la maison ne sont plus livrés à eux-mêmes et peuvent être accompagnés
- **Insistant sur le processus** : se focaliser sur le processus de lecture et d'annotation plutôt que de se centrer sur la tâche matérielle à rendre

### ✨ Fonctionnalités

- ✅ Création de classes
- ✅ Invitation d'élèves avec code personnel
- ✅ Upload de livres (EPUB, PDF)
- ✅ Création de groupes de lecture
- ✅ Statistiques de lecture individuelle et de classe
- ✅ Annotations des phrases
- ✅ Fils de discussion centralisés pour les commentaires

### 🚀 À venir

- **IA** : Accompagnement du lecteur dans l'analyse du livre au cours de la lecture et synthèse de l'interaction auprès du professeur
- **Ludification** : Mesurer le progrès et créer de l'émulation à travers l'octroi de "badges" transportables en ligne ou IRL

### 🛠️ Stack Technique

#### Frontend
- **Next.js** 16.1 (App Router)
- **React** 19.2
- **TypeScript** 5
- **Tailwind CSS** 4.1
- **Lecteurs** : EPUB.js, react-reader
- **UI** : Radix UI, shadcn/ui, Lucide Icons

#### Backend
- **Hono** 4.8 (serveur HTTP)
- **tRPC** 11.7 (API type-safe)
- **Better Auth** 1.4 (authentification)
- **Prisma** ORM

#### Base de données
- **PostgreSQL** 14+

#### Infrastructure
- **Bun** 1.3.5 (runtime & package manager)
- **Turbo** 2.6 (monorepo)
- **Docker** & Docker Compose (déploiement)

### 📁 Architecture du Monorepo

```
conpagina.education/
├── apps/
│   ├── web/       # Application Next.js (frontend)
│   └── server/    # API Hono + tRPC (backend)
└── packages/
    ├── api/       # Définitions tRPC et routeurs
    ├── auth/      # Configuration Better Auth
    ├── db/        # Schéma Prisma et migrations
    └── config/    # Configuration TypeScript partagée
```

### 📋 Prérequis

- **Bun** 1.3.5 ou supérieur
- **PostgreSQL** 14 ou supérieur
- **Node.js** 20+ (optionnel, Bun est recommandé)

### 🚀 Installation et Configuration

#### 1. Cloner le dépôt

```bash
git clone https://github.com/votre-org/conpagina.education.git
cd conpagina.education
```

#### 2. Installer les dépendances

```bash
bun install
```

#### 3. Configuration de l'environnement

```bash
cp .env.production.example .env
```

Éditez le fichier `.env` avec vos valeurs :

```env
# Base de données
DATABASE_URL=postgresql://user:password@localhost:5432/conpagina
POSTGRES_USER=conpagina
POSTGRES_PASSWORD=votre_mot_de_passe
POSTGRES_DB=conpagina
POSTGRES_PORT=5432

# URLs de l'application
APP_URL=http://localhost:3001
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Ports
SERVER_PORT=3000
WEB_PORT=3001

# Better Auth
BETTER_AUTH_SECRET=votre_secret_genere  # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=re_votre_cle
EMAIL_FROM=noreply@votredomaine.com
```

#### 4. Initialiser la base de données

```bash
bun run db:push
```

### 💻 Développement

#### Démarrer tous les services

```bash
bun run dev
```

#### Ou démarrer séparément

```bash
# Frontend (port 3001)
bun run dev:web

# Backend API (port 3000)
bun run dev:server
```

#### Autres commandes utiles

```bash
# Vérification des types TypeScript
bun run check-types

# Studio Prisma (interface de gestion de la DB)
bun run db:studio

# Générer le client Prisma
bun run db:generate

# Créer une migration
bun run db:migrate
```

### 🐳 Déploiement avec Docker

#### Développement

```bash
docker compose up -d
```

#### Production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Assurez-vous que votre fichier `.env` contient toutes les variables nécessaires pour la production (voir `.env.production.example`).

### 🤝 Contribution

Les contributions sont les bienvenues ! Merci de lire les documents suivants avant de contribuer :

- **[CONTRIBUTING.md](CONTRIBUTING.md)** : Guide de contribution
- **[CLA.md](CLA.md)** : Contributor License Agreement (requis)
- **[DCO](DCO)** : Developer Certificate of Origin

> **Note importante** : Toute contribution (PR, patch, code, documentation) nécessite la signature du CLA. Envoyez le CLA signé à : pdapelo at gmail point com

### 📄 Licence

Apache License 2.0 – voir les fichiers [LICENSE](License) et [NOTICE](NOTICE) pour plus de détails.

Copyright (c) 2026 500 Nuances de Geek et contributeurs.

---

## 🇬🇧 English

### About

**Conpagina Education** is an open-source alternative to the defunct Glose Education platform. It enables shared reading, annotation, and pedagogical collaboration around texts. This repository is **public** and open to contributions.

### Project Structure

- **Conpagina Education**: public (this repository) - educational branch
- **Conpagina**: private - main project

### 📖 Social Reading

Social reading takes full advantage of the digital nature of electronic books: reading remains that solitary introspective activity that makes it so valuable while benefiting from networking advantages. **Reading alone but together.**

Concretely, a reader can annotate with a simple click in the margin, with all these notes visible to other members of the reading group and open for discussion threads.

### 🎓 Social Reading in Education

Mastery of written expression holds a fundamental place in education, especially in France where almost all exams, written and oral, involve essay writing.

On the other hand, all research in sociology of education for sixty years has emphasized the determining role of reading socialization, which varies greatly according to social origin and resulting inequalities.

However, the constraints of the classroom as currently organized do not allow for remediation. Paradoxically, beyond a few scattered texts, personal, rich reading allowing reappropriation is practically absent. Furthermore, the contemporary environment further reduces this possibility. On one hand, reading practices, competing with entertainment offerings, are in accelerated decline. On the other hand, unable to accompany students in reading tasks at home, books are increasingly less read and more often summarized by AI chatbots.

**Conpagina Education** aims to reduce this contradiction by:

- **Socializing reading**: by reading together, being able to share and give opinions on their phones, reading practice aligns with existing practices
- **Enabling accompaniment**: students at home are no longer left to themselves and can be accompanied
- **Emphasizing process**: focusing on the reading and annotation process rather than centering on the material task to be submitted

### ✨ Features

- ✅ Class creation
- ✅ Student invitation with personal codes
- ✅ Book upload (EPUB, PDF)
- ✅ Reading group creation
- ✅ Individual and class reading statistics
- ✅ Sentence annotations
- ✅ Centralized discussion threads for comments

### 🚀 Coming Soon

- **AI**: Accompany the reader in book analysis during reading and provide interaction synthesis to the teacher
- **Gamification**: Measure progress and create emulation through "badges" that can be carried online or IRL

### 🛠️ Tech Stack

#### Frontend
- **Next.js** 16.1 (App Router)
- **React** 19.2
- **TypeScript** 5
- **Tailwind CSS** 4.1
- **Readers**: EPUB.js, react-reader
- **UI**: Radix UI, shadcn/ui, Lucide Icons

#### Backend
- **Hono** 4.8 (HTTP server)
- **tRPC** 11.7 (type-safe API)
- **Better Auth** 1.4 (authentication)
- **Prisma** ORM

#### Database
- **PostgreSQL** 14+

#### Infrastructure
- **Bun** 1.3.5 (runtime & package manager)
- **Turbo** 2.6 (monorepo)
- **Docker** & Docker Compose (deployment)

### 📁 Monorepo Architecture

```
conpagina.education/
├── apps/
│   ├── web/       # Next.js application (frontend)
│   └── server/    # Hono + tRPC API (backend)
└── packages/
    ├── api/       # tRPC definitions and routers
    ├── auth/      # Better Auth configuration
    ├── db/        # Prisma schema and migrations
    └── config/    # Shared TypeScript configuration
```

### 📋 Prerequisites

- **Bun** 1.3.5 or higher
- **PostgreSQL** 14 or higher
- **Node.js** 20+ (optional, Bun is recommended)

### 🚀 Installation and Setup

#### 1. Clone the repository

```bash
git clone https://github.com/your-org/conpagina.education.git
cd conpagina.education
```

#### 2. Install dependencies

```bash
bun install
```

#### 3. Environment configuration

```bash
cp .env.production.example .env
```

Edit the `.env` file with your values:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/conpagina
POSTGRES_USER=conpagina
POSTGRES_PASSWORD=your_password
POSTGRES_DB=conpagina
POSTGRES_PORT=5432

# Application URLs
APP_URL=http://localhost:3001
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Ports
SERVER_PORT=3000
WEB_PORT=3001

# Better Auth
BETTER_AUTH_SECRET=your_generated_secret  # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=re_your_key
EMAIL_FROM=noreply@yourdomain.com
```

#### 4. Initialize the database

```bash
bun run db:push
```

### 💻 Development

#### Start all services

```bash
bun run dev
```

#### Or start separately

```bash
# Frontend (port 3001)
bun run dev:web

# Backend API (port 3000)
bun run dev:server
```

#### Other useful commands

```bash
# TypeScript type checking
bun run check-types

# Prisma Studio (DB management interface)
bun run db:studio

# Generate Prisma client
bun run db:generate

# Create a migration
bun run db:migrate
```

### 🐳 Docker Deployment

#### Development

```bash
docker compose up -d
```

#### Production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Ensure your `.env` file contains all necessary variables for production (see `.env.production.example`).

### 🤝 Contributing

Contributions are welcome! Please read the following documents before contributing:

- **[CONTRIBUTING.md](CONTRIBUTING.md)**: Contribution guide
- **[CLA.md](CLA.md)**: Contributor License Agreement (required)
- **[DCO](DCO)**: Developer Certificate of Origin

> **Important note**: Any contribution (PR, patch, code, documentation) requires signing the CLA. Send the signed CLA to: pdapelo at gmail point com

### 📄 License

Apache License 2.0 – see [LICENSE](License) and [NOTICE](NOTICE) files for details.

Copyright (c) 2026 500 Nuances de Geek and contributors.
