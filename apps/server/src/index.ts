import { documentFormat, unreferencedReadingFiles } from "./lib/document-format";
import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@lectio/api/context";
import { appRouter } from "@lectio/api/routers/index";
import { startCommentAlertWorker } from "@lectio/api/lib/comment-alerts";
import { auth } from "@lectio/auth";
import { db, document, groupMember, user, eq, and, sql } from "@lectio/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { writeFile, readdir, stat, unlink, appendFile, readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

// ============================================
// STRUCTURED LOGGING - JSON logs with file persistence
// ============================================
const isProduction = process.env.NODE_ENV === "production";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Ring buffer pour garder les derniers logs en mémoire
const LOG_BUFFER_SIZE = 1000;
const logBuffer: LogEntry[] = [];
let logBufferIndex = 0;

// Configuration persistance
const LOGS_DIR = path.join(process.cwd(), "uploads", "logs");
const METRICS_FILE = path.join(LOGS_DIR, "metrics.json");
const LOG_RETENTION_DAYS = 7;

// Compteurs de métriques (seront chargés depuis le fichier au démarrage)
let metrics = {
  requests: { total: 0, success: 0, errors: 0 },
  uploads: { total: 0, success: 0, errors: 0, bytes: 0 },
  downloads: { total: 0, bytes: 0 },
  covers: { extracted: 0, fetched: 0, cached: 0, placeholders: 0 },
  startTime: Date.now(),
  lastSaved: Date.now(),
};

// Créer le dossier logs au démarrage (sync pour garantir qu'il existe)
try {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (e) {
  console.error("Failed to create logs directory:", e);
}

// Obtenir le chemin du fichier log du jour
function getLogFilePath(date: Date = new Date()): string {
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `${dateStr}.jsonl`);
}

// Écrire un log dans le fichier (async, fire-and-forget)
function persistLog(entry: LogEntry) {
  const logFile = getLogFilePath();
  const line = JSON.stringify(entry) + "\n";

  // Fire-and-forget pour ne pas bloquer
  appendFile(logFile, line).catch((err) => {
    console.error("Failed to persist log:", err);
  });
}

// Sauvegarder les métriques (appelé périodiquement)
async function saveMetrics() {
  try {
    metrics.lastSaved = Date.now();
    await writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2));
  } catch (err) {
    console.error("Failed to save metrics:", err);
  }
}

// Charger les métriques au démarrage
async function loadMetrics() {
  try {
    if (existsSync(METRICS_FILE)) {
      const data = await readFile(METRICS_FILE, "utf-8");
      const saved = JSON.parse(data);
      // Conserver les compteurs mais reset le startTime
      metrics = {
        ...saved,
        startTime: Date.now(),
      };
      console.log("Metrics loaded from file");
    }
  } catch (err) {
    console.error("Failed to load metrics:", err);
  }
}

// Charger les logs du jour dans le buffer mémoire
async function loadTodayLogs() {
  try {
    const logFile = getLogFilePath();
    if (existsSync(logFile)) {
      const data = await readFile(logFile, "utf-8");
      const lines = data.trim().split("\n").filter(Boolean);

      // Charger les derniers logs (max LOG_BUFFER_SIZE)
      const recentLines = lines.slice(-LOG_BUFFER_SIZE);
      for (const line of recentLines) {
        try {
          const entry = JSON.parse(line) as LogEntry;
          addToLogBuffer(entry);
        } catch {
          // Ignorer les lignes mal formées
        }
      }
      console.log(`Loaded ${recentLines.length} logs from today's file`);
    }
  } catch (err) {
    console.error("Failed to load today's logs:", err);
  }
}

// Nettoyer les vieux fichiers de logs
async function cleanupOldLogs() {
  try {
    const files = await readdir(LOGS_DIR);
    const now = Date.now();
    const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;

      const filePath = path.join(LOGS_DIR, file);
      const stats = await stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        await unlink(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  } catch (err) {
    console.error("Failed to cleanup old logs:", err);
  }
}

// Sauvegarder les métriques toutes les 5 minutes
setInterval(() => {
  saveMetrics();
}, 5 * 60 * 1000);

// Nettoyer les vieux logs une fois par jour
setInterval(() => {
  cleanupOldLogs();
}, 24 * 60 * 60 * 1000);

// Initialisation au démarrage
(async () => {
  await loadMetrics();
  await loadTodayLogs();
  await cleanupOldLogs();
})();

function addToLogBuffer(entry: LogEntry) {
  if (logBuffer.length < LOG_BUFFER_SIZE) {
    logBuffer.push(entry);
  } else {
    logBuffer[logBufferIndex] = entry;
    logBufferIndex = (logBufferIndex + 1) % LOG_BUFFER_SIZE;
  }
}

function getRecentLogs(count: number = 100, level?: LogLevel): LogEntry[] {
  const logs = logBuffer.slice().sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (level) {
    return logs.filter(l => l.level === level).slice(0, count);
  }
  return logs.slice(0, count);
}

const log = {
  _log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: isProduction ? undefined : error.stack,
      };
    }

    // Toujours ajouter au buffer en mémoire
    addToLogBuffer(entry);

    // Persister dans le fichier
    persistLog(entry);

    if (isProduction) {
      // JSON output for log aggregators (e.g., CloudWatch, Datadog)
      console.log(JSON.stringify(entry));
    } else {
      // Human-readable output for development
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
      console.log(prefix, message, context ? JSON.stringify(context) : "");
      if (error) console.error(error);
    }
  },

  debug(message: string, context?: Record<string, unknown>) {
    if (!isProduction) this._log("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    this._log("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    this._log("warn", message, context);
  },
  error(message: string, error?: Error, context?: Record<string, unknown>) {
    this._log("error", message, context, error);
  },
};

// ============================================
// RATE LIMITING - Protection contre DDoS/brute force
// ============================================
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Nettoyer les entrées expirées toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter(maxRequests: number, windowMs: number) {
  return async (c: any, next: () => Promise<void>) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c.req.header("x-real-ip")
      || "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }

    // Ajouter les headers de rate limit
    c.header("X-RateLimit-Limit", maxRequests.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count).toString());
    c.header("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1000).toString());

    if (entry.count > maxRequests) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }

    await next();
  };
}

// Rate limiters pour différents endpoints
const authRateLimiter = createRateLimiter(10, 60 * 1000);      // 10 req/min pour auth
const uploadRateLimiter = createRateLimiter(20, 60 * 1000);    // 20 req/min pour upload
const apiRateLimiter = createRateLimiter(200, 60 * 1000);      // 200 req/min pour API générale

// ============================================
// PATH TRAVERSAL PROTECTION
// ============================================
function validateFilePath(filepath: string, allowedDir: string): string | null {
  // Résoudre les chemins absolus
  const resolvedPath = path.resolve(process.cwd(), filepath);
  const uploadsDir = path.resolve(process.cwd(), allowedDir);

  // Vérifier que le chemin résolu reste dans le dossier autorisé
  if (!resolvedPath.startsWith(uploadsDir + path.sep) && resolvedPath !== uploadsDir) {
    log.warn("Path traversal attempt detected", { attemptedPath: filepath });
    return null;
  }

  return resolvedPath;
}

const app = new Hono();

// Logger HTTP uniquement en développement
if (!isProduction) {
  app.use(logger());
}
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Rate limiting sur les endpoints d'authentification
app.use("/api/auth/*", authRateLimiter);
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Rate limiting sur l'upload
app.use("/api/upload/*", uploadRateLimiter);

// Même contrôle d’accès pour EPUB et PDF ; ancienne route conservée.
app.on("POST", ["/api/upload/document", "/api/upload/epub"], async (c) => {
  try {
    // Vérifier l'authentification
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const groupId = formData.get("groupId") as string | null;
    const isPublic = formData.get("isPublic") as string | null;

    if (!(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const buffer = await file.arrayBuffer();
    const format = documentFormat(file.name, file.type, new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)));
    if (!format) {
      return c.json({ error: "Le fichier doit être un EPUB ou un PDF valide." }, 400);
    }

    // Récupérer le rôle de l'utilisateur
    const [userData] = await db.select({ role: user.role, storageUsed: user.storageUsed, storageQuota: user.storageQuota })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const userRole = userData?.role;

    // Vérifier les permissions pour upload public
    if (isPublic === "true") {
      if (userRole !== "ADMIN") {
        return c.json({ error: "Seuls les administrateurs peuvent ajouter des livres publics" }, 403);
      }
    }

    // Vérifier les permissions pour upload personnel (sans groupId)
    if (!groupId && isPublic !== "true") {
      // Les STUDENTS ne peuvent pas uploader de livres personnels
      if (userRole === "STUDENT") {
        return c.json({ error: "Les élèves ne peuvent pas importer de livres personnels" }, 403);
      }
    }

    // Vérifier les permissions pour upload dans un groupe
    if (groupId) {
      // Check user's role within this specific group
      const membership = await db.query.groupMember.findFirst({
        where: (gm, { and, eq }) => and(eq(gm.groupId, groupId), eq(gm.userId, session.user.id)),
      });

      const groupRole = membership?.role;
      // Only OWNER or ADMIN of the group can upload books to it
      if (groupRole !== "OWNER" && groupRole !== "ADMIN") {
        return c.json({ error: "Seuls les administrateurs peuvent ajouter des livres" }, 403);
      }
    }

    // Vérifier le quota de stockage (userData already fetched above)
    if (userData) {
      const newTotal = (userData.storageUsed || 0) + file.size;
      if (newTotal > (userData.storageQuota || 500 * 1024 * 1024)) {
        const usedMB = Math.round((userData.storageUsed || 0) / 1024 / 1024);
        const quotaMB = Math.round((userData.storageQuota || 500 * 1024 * 1024) / 1024 / 1024);
        return c.json({
          error: `Quota de stockage dépassé (${usedMB}/${quotaMB} MB utilisés)`,
          code: "QUOTA_EXCEEDED"
        }, 413);
      }
    }

    // Créer le dossier uploads s'il n'existe pas
    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Générer un nom de fichier unique
    const fileId = crypto.randomUUID();
    const filename = file.name;
    const filepath = path.join(uploadsDir, `${fileId}.${format.extension}`);

    // Sauvegarder le fichier
    await writeFile(filepath, Buffer.from(buffer));

    // Extraire les métadonnées (Titre et Auteur)
    let title = filename.replace(/\.(epub|pdf)$/i, "");
    let author: string | null = null;

    try {
      if (format.extension === "epub") {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buffer);

        const containerFile = zip.file("META-INF/container.xml");
        if (containerFile) {
          const containerXml = await containerFile.async("string");
          const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);

          if (rootfileMatch) {
            const opfPath = rootfileMatch[1];
            const opfFile = zip.file(opfPath);

            if (opfFile) {
              const opfXml = await opfFile.async("string");

              // Extraire le titre
              const titleMatch = opfXml.match(/<dc:title[^>]*>(.*?)<\/dc:title>/i);
              if (titleMatch) {
                title = titleMatch[1];
              }

              // Extraire l'auteur
              const authorMatch = opfXml.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/i);
              if (authorMatch) {
                author = authorMatch[1];
              }
            }
          }
        }
      }
    } catch (e) {
      log.warn("Error extracting metadata", { error: e instanceof Error ? e.message : String(e) });
      // Fallback to filename if extraction fails
    }

    // Enregistrer dans la base de données
    const [newDocument] = await db
      .insert(document)
      .values({
        id: fileId,
        title: title,
        author: author,
        filename: filename,
        filepath: `uploads/${fileId}.${format.extension}`,
        filesize: file.size.toString(),
        mimeType: format.mimeType,
        ownerId: session.user.id,
        groupId: groupId || null,
        isPublic: isPublic === "true" ? "true" : "false",
      })
      .returning();

    // Mettre à jour le stockage utilisé
    await db.update(user)
      .set({ storageUsed: sql`${user.storageUsed} + ${file.size}` })
      .where(eq(user.id, session.user.id));

    // Métriques
    metrics.uploads.success++;
    metrics.uploads.bytes += file.size;
    log.info("Upload success", { fileId, title, author, size: file.size, userId: session.user.id });

    return c.json({
      success: true,
      document: newDocument,
    });
  } catch (error) {
    metrics.uploads.errors++;
    log.error("Upload error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Endpoint pour uploader une image (logo, etc.) - Admin only
app.post("/api/upload/image", async (c) => {
  try {
    // Vérifier l'authentification
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Vérifier que l'utilisateur est admin
    const [userData] = await db.select({ role: user.role })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!userData || userData.role !== "ADMIN") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Vérifier le type MIME (images uniquement)
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Only image files are allowed (PNG, JPG, GIF, WebP, SVG)" }, 400);
    }

    // Limite de taille: 5MB
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 413);
    }

    // Créer le dossier uploads/site s'il n'existe pas
    const uploadsDir = path.join(process.cwd(), "uploads", "site");
    await mkdir(uploadsDir, { recursive: true });

    // Générer un nom de fichier unique
    const fileId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "png";
    const filename = `${fileId}.${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Sauvegarder le fichier
    await writeFile(filepath, Buffer.from(buffer));

    log.info("Image uploaded", { filename, user: session.user.id });

    return c.json({
      success: true,
      url: `/api/site-assets/${filename}`,
      filename,
    });
  } catch (error) {
    log.error("Image upload error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Servir les fichiers statiques du site (logos, etc.)
app.get("/api/site-assets/:filename", async (c) => {
  try {
    const filename = c.req.param("filename");

    // Protection contre path traversal
    const filepath = validateFilePath(`uploads/site/${filename}`, "uploads/site");
    if (!filepath) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      return c.json({ error: "File not found" }, 404);
    }

    // Déterminer le type MIME
    let mimeType = "image/png";
    if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (filename.endsWith(".gif")) mimeType = "image/gif";
    else if (filename.endsWith(".webp")) mimeType = "image/webp";
    else if (filename.endsWith(".svg")) mimeType = "image/svg+xml";

    return new Response(file, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": file.size.toString(),
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "",
        "Access-Control-Allow-Credentials": "true",
        "Cache-Control": "public, max-age=86400", // Cache 24h
      },
    });
  } catch (error) {
    log.error("Site asset serve error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Failed to serve file" }, 500);
  }
});

// Servir les fichiers EPUB
app.get("/api/files/:fileId", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const fileId = c.req.param("fileId");

    // Récupérer les infos du fichier depuis la DB
    const [doc] = await db
      .select()
      .from(document)
      .where(eq(document.id, fileId))
      .limit(1);

    if (!doc) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Vérifier les permissions
    const isOwner = doc.ownerId === session.user.id;
    const isPublicBook = doc.isPublic === "true";
    let hasAccess = isOwner || isPublicBook;

    if (!hasAccess && doc.groupId) {
      // Vérifier si l'utilisateur est membre du groupe
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, doc.groupId),
            eq(groupMember.userId, session.user.id)
          )
        )
        .limit(1);

      if (membership) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Protection contre path traversal
    const filepath = validateFilePath(doc.filepath, "uploads");
    if (!filepath) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    log.debug("Serving file", { fileId });

    // Lire le fichier
    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      log.warn("File not found on disk", { fileId });
      return c.json({ error: "File not found on disk" }, 404);
    }

    // Métriques
    metrics.downloads.total++;
    metrics.downloads.bytes += file.size;

    // Retourner le fichier avec les bons headers
    return new Response(file, {
      headers: {
        "Content-Type": doc.mimeType === "application/pdf" ? "application/pdf" : "application/epub+zip",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": file.size.toString(),
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "",
        "Access-Control-Allow-Credentials": "true",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    log.error("File serve error", error instanceof Error ? error : new Error(String(error)), { fileId: c.req.param("fileId") });
    return c.json({ error: "Failed to serve file" }, 500);
  }
});

// Rate limiting sur l'API tRPC
app.use("/trpc/*", apiRateLimiter);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

// Rate limiting sur les endpoints API généraux
app.use("/api/files/*", apiRateLimiter);
app.use("/api/cover/*", apiRateLimiter);

// Healthcheck endpoint pour monitoring/Docker
app.get("/health", async (c) => {
  const startTime = Date.now();
  let dbStatus = "ok";

  try {
    // Test de connexion à la DB
    await db.execute("SELECT 1");
  } catch (err) {
    dbStatus = "error";
  }

  const memoryUsage = process.memoryUsage();

  return c.json({
    status: dbStatus === "ok" ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + " MB",
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + " MB",
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + " MB",
    },
    responseTime: Date.now() - startTime + " ms",
  }, dbStatus === "ok" ? 200 : 503);
});

// ============================================
// ADMIN ENDPOINTS - Stats, Logs, Storage
// ============================================

// Middleware pour vérifier l'accès admin
async function requireAdmin(c: any, next: () => Promise<void>) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [userData] = await db.select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!userData || userData.role !== "ADMIN") {
    return c.json({ error: "Admin access required" }, 403);
  }

  c.set("adminUser", session.user);
  await next();
}

// Helper pour calculer la taille d'un dossier
async function getDirectorySize(dirPath: string): Promise<{ totalSize: number; fileCount: number; files: Array<{ name: string; size: number; mtime: Date }> }> {
  const result = { totalSize: 0, fileCount: 0, files: [] as Array<{ name: string; size: number; mtime: Date }> };

  if (!existsSync(dirPath)) {
    return result;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        const stats = await stat(fullPath);
        result.totalSize += stats.size;
        result.fileCount++;
        result.files.push({ name: entry.name, size: stats.size, mtime: stats.mtime });
      } else if (entry.isDirectory()) {
        const subResult = await getDirectorySize(fullPath);
        result.totalSize += subResult.totalSize;
        result.fileCount += subResult.fileCount;
        result.files.push(...subResult.files.map(f => ({ ...f, name: `${entry.name}/${f.name}` })));
      }
    }
  } catch (err) {
    log.error("Error reading directory", err instanceof Error ? err : new Error(String(err)), { dirPath });
  }

  return result;
}

// Endpoint: Stats globales du serveur
app.get("/api/admin/stats", requireAdmin, async (c) => {
  const startTime = Date.now();

  try {
    // Stats mémoire
    const memoryUsage = process.memoryUsage();

    // Stats stockage disque
    const uploadsDir = path.join(process.cwd(), "uploads");
    const diskStats = await getDirectorySize(uploadsDir);

    // Compter les fichiers de lecture sur disque
    const readingFiles = diskStats.files.filter(f => /\.(epub|pdf)$/i.test(f.name));

    // Stats base de données
    const dbStatsResult = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM document) as total_documents,
        (SELECT COUNT(*) FROM "user") as total_users,
        (SELECT COUNT(*) FROM "group") as total_groups,
        (SELECT COALESCE(SUM(CAST(filesize AS BIGINT)), 0) FROM document) as total_db_size
    `);
    const dbStats = dbStatsResult.rows[0] as Record<string, unknown> | undefined;

    const totalDocumentsInDb = Number(dbStats?.total_documents) || 0;
    const totalUsersInDb = Number(dbStats?.total_users) || 0;
    const totalGroupsInDb = Number(dbStats?.total_groups) || 0;
    const totalDbSize = Number(dbStats?.total_db_size) || 0;

    // Détecter les orphelins - récupérer plus d'infos pour l'affichage
    const documentsInDb = await db.select({
      id: document.id,
      filepath: document.filepath,
      title: document.title,
      ownerId: document.ownerId
    }).from(document);

    // Fichiers sur disque sans entrée DB
    const orphanFiles = unreferencedReadingFiles(readingFiles, documentsInDb, process.cwd());

    // Entrées DB sans fichier sur disque - avec infos enrichies
    const missingFiles: Array<{ id: string; filepath: string; title: string; ownerName: string; ownerEmail: string }> = [];
    for (const doc of documentsInDb) {
      const filePath = path.join(process.cwd(), doc.filepath);
      if (!existsSync(filePath)) {
        // Récupérer le nom du propriétaire
        const [owner] = await db.select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, doc.ownerId))
          .limit(1);

        missingFiles.push({
          id: doc.id,
          filepath: doc.filepath,
          title: doc.title,
          ownerName: owner?.name || 'Utilisateur inconnu',
          ownerEmail: owner?.email || ''
        });
      }
    }

    // Stats logs
    const logStats = {
      total: logBuffer.length,
      errors: logBuffer.filter(l => l.level === "error").length,
      warnings: logBuffer.filter(l => l.level === "warn").length,
      lastError: logBuffer.filter(l => l.level === "error").sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0] || null,
    };

    return c.json({
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      uptime: process.uptime(),

      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },

      storage: {
        diskUsed: diskStats.totalSize,
        diskUsedMB: Math.round(diskStats.totalSize / 1024 / 1024),
        totalFilesOnDisk: readingFiles.length,
        coversSize: diskStats.files.filter(f => f.name.startsWith("covers/")).reduce((acc, f) => acc + f.size, 0),
        siteAssetsSize: diskStats.files.filter(f => f.name.startsWith("site/")).reduce((acc, f) => acc + f.size, 0),
      },

      database: {
        totalDocuments: totalDocumentsInDb,
        totalUsers: totalUsersInDb,
        totalGroups: totalGroupsInDb,
        reportedSize: totalDbSize,
        reportedSizeMB: Math.round(totalDbSize / 1024 / 1024),
      },

      integrity: {
        orphanFiles: orphanFiles.map(f => ({ name: f.name, size: f.size })),
        orphanFilesCount: orphanFiles.length,
        orphanFilesSize: orphanFiles.reduce((acc, f) => acc + f.size, 0),
        missingFiles: missingFiles,
        missingFilesCount: missingFiles.length,
        isHealthy: orphanFiles.length === 0 && missingFiles.length === 0,
      },

      logs: logStats,

      metrics: {
        ...metrics,
        uptimeSeconds: Math.round((Date.now() - metrics.startTime) / 1000),
      },

      rateLimiter: {
        activeEntries: rateLimitStore.size,
      },
    });
  } catch (error) {
    log.error("Admin stats error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

// Endpoint: Logs récents
app.get("/api/admin/logs", requireAdmin, async (c) => {
  const count = parseInt(c.req.query("count") || "100");
  const level = c.req.query("level") as LogLevel | undefined;

  const logs = getRecentLogs(Math.min(count, 500), level);

  return c.json({
    total: logBuffer.length,
    returned: logs.length,
    logs,
  });
});

// Endpoint: Stats par utilisateur
app.get("/api/admin/users-storage", requireAdmin, async (c) => {
  try {
    const usersWithStorage = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storageUsed: user.storageUsed,
      storageQuota: user.storageQuota,
      createdAt: user.createdAt,
    }).from(user).orderBy(sql`${user.storageUsed} DESC NULLS LAST`);

    // Compter les documents par utilisateur
    const docCounts = await db.select({
      ownerId: document.ownerId,
      count: sql<number>`COUNT(*)`.as("count"),
      totalSize: sql<number>`COALESCE(SUM(CAST(filesize AS BIGINT)), 0)`.as("totalSize"),
    }).from(document).groupBy(document.ownerId);

    const docCountMap = new Map(docCounts.map(d => [d.ownerId, { count: Number(d.count), totalSize: Number(d.totalSize) }]));

    const result = usersWithStorage.map(u => ({
      ...u,
      storageUsed: Number(u.storageUsed) || 0,
      storageQuota: Number(u.storageQuota) || 500 * 1024 * 1024,
      documentCount: docCountMap.get(u.id)?.count || 0,
      actualStorageUsed: docCountMap.get(u.id)?.totalSize || 0,
      storageUsedMB: Math.round((Number(u.storageUsed) || 0) / 1024 / 1024),
      quotaMB: Math.round((Number(u.storageQuota) || 500 * 1024 * 1024) / 1024 / 1024),
      usagePercent: Math.round(((Number(u.storageUsed) || 0) / (Number(u.storageQuota) || 500 * 1024 * 1024)) * 100),
    }));

    return c.json({
      total: result.length,
      users: result,
    });
  } catch (error) {
    log.error("Users storage error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Failed to get user storage" }, 500);
  }
});

// Endpoint: Nettoyer les fichiers orphelins
app.post("/api/admin/cleanup-orphans", requireAdmin, async (c) => {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads");
    const diskStats = await getDirectorySize(uploadsDir);
    const readingFiles = diskStats.files.filter(f => /\.(epub|pdf)$/i.test(f.name) && !f.name.includes("/"));

    const documentsInDb = await db.select({ filepath: document.filepath }).from(document);

    const orphanFiles = unreferencedReadingFiles(readingFiles, documentsInDb, process.cwd());

    const deleted: string[] = [];
    const errors: string[] = [];

    for (const orphan of orphanFiles) {
      try {
        const filePath = path.join(uploadsDir, orphan.name);
        await unlink(filePath);
        deleted.push(orphan.name);
        log.info("Deleted orphan file", { file: orphan.name, size: orphan.size });
      } catch (err) {
        errors.push(orphan.name);
        log.error("Failed to delete orphan", err instanceof Error ? err : new Error(String(err)), { file: orphan.name });
      }
    }

    return c.json({
      success: true,
      deleted,
      errors,
      freedBytes: orphanFiles.filter(f => deleted.includes(f.name)).reduce((acc, f) => acc + f.size, 0),
    });
  } catch (error) {
    log.error("Cleanup error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Cleanup failed" }, 500);
  }
});

// Endpoint: Nettoyer les entrées DB sans fichiers (inverse des orphelins)
app.post("/api/admin/cleanup-missing", requireAdmin, async (c) => {
  try {
    // Récupérer tous les documents de la DB
    const documentsInDb = await db.select({
      id: document.id,
      filepath: document.filepath,
      title: document.title
    }).from(document);

    const missing: Array<{ id: string; filepath: string; title: string }> = [];

    // Vérifier quels documents n'ont plus de fichier sur le disque
    for (const doc of documentsInDb) {
      const filePath = path.join(process.cwd(), doc.filepath);
      if (!existsSync(filePath)) {
        missing.push({ id: doc.id, filepath: doc.filepath, title: doc.title });
      }
    }

    const deleted: string[] = [];
    const errors: string[] = [];

    // Supprimer les entrées de la DB
    for (const doc of missing) {
      try {
        await db.delete(document).where(eq(document.id, doc.id));
        deleted.push(doc.id);
        log.info("Deleted missing file entry from DB", {
          id: doc.id,
          title: doc.title,
          filepath: doc.filepath
        });
      } catch (err) {
        errors.push(doc.id);
        log.error("Failed to delete missing entry", err instanceof Error ? err : new Error(String(err)), {
          id: doc.id
        });
      }
    }

    return c.json({
      success: true,
      deleted,
      errors,
      deletedCount: deleted.length,
    });
  } catch (error) {
    log.error("Cleanup missing files error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Cleanup missing files failed" }, 500);
  }
});

// Endpoint: Lister les fichiers de logs disponibles
app.get("/api/admin/log-files", requireAdmin, async (c) => {
  try {
    if (!existsSync(LOGS_DIR)) {
      return c.json({ files: [] });
    }

    const files = await readdir(LOGS_DIR);
    const logFiles = [];

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;

      const filePath = path.join(LOGS_DIR, file);
      const stats = await stat(filePath);
      const date = file.replace(".jsonl", "");

      // Compter les lignes (logs)
      const content = await readFile(filePath, "utf-8");
      const lineCount = content.trim().split("\n").filter(Boolean).length;

      logFiles.push({
        date,
        filename: file,
        size: stats.size,
        lineCount,
        isToday: date === new Date().toISOString().split("T")[0],
      });
    }

    // Trier par date décroissante
    logFiles.sort((a, b) => b.date.localeCompare(a.date));

    return c.json({
      files: logFiles,
      retentionDays: LOG_RETENTION_DAYS,
      logsDir: LOGS_DIR,
    });
  } catch (error) {
    log.error("List log files error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Failed to list log files" }, 500);
  }
});

// Endpoint: Lire les logs d'une date spécifique
app.get("/api/admin/logs/:date", requireAdmin, async (c) => {
  try {
    const date = c.req.param("date");
    const count = parseInt(c.req.query("count") || "100");
    const level = c.req.query("level") as LogLevel | undefined;

    // Valider le format de date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "Invalid date format. Use YYYY-MM-DD" }, 400);
    }

    const logFile = path.join(LOGS_DIR, `${date}.jsonl`);

    if (!existsSync(logFile)) {
      return c.json({ error: "Log file not found for this date", logs: [] }, 404);
    }

    const content = await readFile(logFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    let logs: LogEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (!level || entry.level === level) {
          logs.push(entry);
        }
      } catch {
        // Ignorer les lignes mal formées
      }
    }

    // Trier par timestamp décroissant et limiter
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    logs = logs.slice(0, Math.min(count, 500));

    return c.json({
      date,
      total: lines.length,
      returned: logs.length,
      logs,
    });
  } catch (error) {
    log.error("Read log file error", error instanceof Error ? error : new Error(String(error)));
    return c.json({ error: "Failed to read log file" }, 500);
  }
});

// Endpoint: Forcer la sauvegarde des métriques
app.post("/api/admin/save-metrics", requireAdmin, async (c) => {
  try {
    await saveMetrics();
    return c.json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return c.json({ error: "Failed to save metrics" }, 500);
  }
});

app.get("/", (c) => {
  return c.text("OK");
});

// Constantes pour les covers
const COVERS_DIR = "uploads/covers";
const COVER_WIDTH = 400; // Largeur max en pixels
const COVER_QUALITY = 80; // Qualité JPEG (0-100)
const FETCH_TIMEOUT = 5000; // Timeout en ms

// Helper pour fetch avec timeout
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Générer un hash simple pour le cache basé sur titre+auteur
function getCoverCacheKey(title: string, author: string | null): string {
  const str = `${title.toLowerCase().trim()}|${(author || "").toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Fonction pour chercher une cover sur Open Library avec cache intelligent
async function fetchOpenLibraryCover(title: string, author: string | null, _fileId?: string) {
  // Cache basé sur titre+auteur (pas fileId) pour éviter les doublons
  const cacheKey = getCoverCacheKey(title, author);
  const coverPath = `${COVERS_DIR}/${cacheKey}.jpg`;
  const noCoverPath = `${COVERS_DIR}/${cacheKey}.nocover`;

  // 1. Vérifier le cache - cover déjà téléchargée
  const cachedCover = Bun.file(coverPath);
  if (await cachedCover.exists()) {
    return new Response(await cachedCover.arrayBuffer(), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800", // 7 jours
      },
    });
  }

  // 2. Vérifier si déjà marqué "pas de cover"
  const noCoverMarker = Bun.file(noCoverPath);
  if (await noCoverMarker.exists()) {
    return generatePlaceholderSvg();
  }

  // 3. Nettoyer titre et auteur pour la recherche
  const cleanTitle = title
    .replace(/\.epub$/i, "")
    .replace(/[_\-\.]+/g, " ")
    .replace(/\([^)]*\)/g, "") // Enlever les parenthèses
    .replace(/\[[^\]]*\]/g, "") // Enlever les crochets
    .replace(/\s+/g, " ")
    .trim();

  const cleanAuthor = author
    ?.replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 4. Rechercher sur Open Library
  try {
    const query = encodeURIComponent(
      cleanAuthor ? `${cleanTitle} ${cleanAuthor}` : cleanTitle
    );

    console.log(`📚 Open Library: "${cleanTitle}" by "${cleanAuthor || '?'}"`);

    const searchRes = await fetchWithTimeout(
      `https://openlibrary.org/search.json?q=${query}&limit=5&fields=cover_i`,
      FETCH_TIMEOUT
    );

    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);

    const data = await searchRes.json() as { docs?: Array<{ cover_i?: number }> };
    const docWithCover = data.docs?.find(doc => doc.cover_i);

    if (docWithCover?.cover_i) {
      // Télécharger la cover (taille M = medium)
      const coverRes = await fetchWithTimeout(
        `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-M.jpg`,
        FETCH_TIMEOUT
      );

      if (coverRes.ok) {
        const rawBuffer = Buffer.from(await coverRes.arrayBuffer());

        // Compresser et redimensionner avec sharp
        const optimizedBuffer = await sharp(rawBuffer)
          .resize(COVER_WIDTH, null, { withoutEnlargement: true })
          .jpeg({ quality: COVER_QUALITY, progressive: true })
          .toBuffer();

        // Sauvegarder en cache
        await mkdir(COVERS_DIR, { recursive: true });
        await writeFile(coverPath, optimizedBuffer);
        console.log(`📚 Cover cached: ${cacheKey} (${Math.round(optimizedBuffer.length / 1024)}KB)`);

        return new Response(optimizedBuffer, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=604800",
          },
        });
      }
    }

    // Pas de cover trouvée - marquer pour éviter de refaire la requête
    await mkdir(COVERS_DIR, { recursive: true });
    await writeFile(noCoverPath, new Date().toISOString());
    console.log(`📚 No cover found: ${cacheKey}`);
  } catch (error) {
    // En cas d'erreur réseau, ne pas marquer .nocover (on réessaiera)
    console.error("📚 Open Library error:", error instanceof Error ? error.message : error);
  }

  return generatePlaceholderSvg();
}

function generatePlaceholderSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect width="300" height="450" fill="#f5f5f5"/>
    <rect x="100" y="150" width="100" height="130" rx="4" fill="none" stroke="#d4d4d4" stroke-width="2"/>
    <path d="M120 170 h60 M120 190 h50 M120 210 h40" stroke="#d4d4d4" stroke-width="2" stroke-linecap="round"/>
    <text x="150" y="320" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#a3a3a3">Pas de couverture</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Endpoint pour extraire la cover d'un EPUB
app.get("/api/cover/:fileId", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const fileId = c.req.param("fileId");

    // Récupérer les infos du fichier depuis la DB pour avoir le vrai path
    const [doc] = await db
      .select()
      .from(document)
      .where(eq(document.id, fileId))
      .limit(1);

    if (!doc) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Vérifier les permissions
    const isOwner = doc.ownerId === session.user.id;
    const isPublicBook = doc.isPublic === "true";
    let hasAccess = isOwner || isPublicBook;

    if (!hasAccess && doc.groupId) {
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, doc.groupId),
            eq(groupMember.userId, session.user.id)
          )
        )
        .limit(1);

      if (membership) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Protection contre path traversal
    const filepath = validateFilePath(doc.filepath, "uploads");
    if (!filepath) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      return c.json({ error: "File not found" }, 404);
    }

    if (doc.mimeType === "application/pdf") {
      return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="340" viewBox="0 0 240 340"><rect width="240" height="340" fill="#e0e7ff"/><path d="M70 65h65l35 35v160H70z" fill="white" stroke="#6366f1" stroke-width="3"/><text x="120" y="185" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#4338ca">PDF</text></svg>`, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
    }

    // Utiliser JSZip ou lire directement avec Bun
    const { Glob } = await import("bun");
    const JSZip = (await import("jszip")).default;

    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    // Chercher le fichier container.xml pour trouver le rootfile
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) {
      return c.json({ error: "Invalid EPUB: no container.xml" }, 400);
    }

    const containerXml = await containerFile.async("string");
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) {
      return c.json({ error: "Invalid EPUB: no rootfile" }, 400);
    }

    const opfPath = rootfileMatch[1];
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      return c.json({ error: "Invalid EPUB: OPF not found" }, 400);
    }

    const opfXml = await opfFile.async("string");
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

    // Chercher la cover dans le manifest
    // Méthode 1: chercher un item avec properties="cover-image"
    let coverPath: string | null = null;
    const coverImageMatch = opfXml.match(/<item[^>]*properties="cover-image"[^>]*href="([^"]+)"/);
    if (coverImageMatch) {
      coverPath = opfDir + coverImageMatch[1];
    }

    // Méthode 2: chercher meta cover puis l'item correspondant
    if (!coverPath) {
      const metaCoverMatch = opfXml.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"/);
      if (metaCoverMatch) {
        const coverId = metaCoverMatch[1];
        const itemMatch = opfXml.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`));
        if (itemMatch) {
          coverPath = opfDir + itemMatch[1];
        }
      }
    }

    // Méthode 3: chercher un item avec id="cover" ou id="cover-image"
    if (!coverPath) {
      const coverIdMatch = opfXml.match(/<item[^>]*id="(?:cover|cover-image|coverimage)"[^>]*href="([^"]+)"/i);
      if (coverIdMatch) {
        coverPath = opfDir + coverIdMatch[1];
      }
    }

    if (!coverPath) {
      // Chercher une cover sur Open Library
      return fetchOpenLibraryCover(doc.title, doc.author, fileId);
    }

    // Normaliser le chemin (enlever les ./ et résoudre les ..)
    coverPath = coverPath.replace(/^\.\//, "");

    const coverFile = zip.file(coverPath);
    if (!coverFile) {
      // Chercher une cover sur Open Library
      return fetchOpenLibraryCover(doc.title, doc.author, fileId);
    }

    const coverBuffer = await coverFile.async("arraybuffer");

    // Déterminer le type MIME
    let mimeType = "image/jpeg";
    if (coverPath.endsWith(".png")) mimeType = "image/png";
    else if (coverPath.endsWith(".gif")) mimeType = "image/gif";
    else if (coverPath.endsWith(".webp")) mimeType = "image/webp";

    return new Response(coverBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400", // Cache 24h
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (error) {
    log.error("Cover extraction failed", error instanceof Error ? error : new Error(String(error)), { fileId: c.req.param("fileId") });
    return c.json({ error: "Failed to extract cover" }, 500);
  }
});

// Startup log
startCommentAlertWorker();
log.info("Server starting", { port: 3000, env: process.env.NODE_ENV || "development" });

export default {
  port: 3000,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
