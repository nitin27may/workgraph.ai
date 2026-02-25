import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  FileArchive,
  Presentation,
  File,
  FileVideo,
  FileAudio,
  NotebookPen,
  LayoutDashboard,
  Globe,
  Folder,
  Mail,
  Database,
  BookOpen,
  HardDrive,
  Users,
  Cloud,
  Droplet,
  type LucideIcon,
} from "lucide-react";

// ============ File Type Detection ============

export interface FileTypeInfo {
  icon: LucideIcon;
  /** M365-style letter to render inside a colored square (e.g., "W" for Word) */
  letter?: string;
  /** Solid background color for the letter icon (M365 brand colors) */
  solidBg: string;
  /** Light background for Lucide icon fallback */
  bg: string;
  fg: string;
  label: string;
}

// Microsoft 365 brand colors sourced from official product icons
export const FILE_TYPES: Record<string, FileTypeInfo> = {
  // ── Office apps (letter icons) ──
  word:        { icon: FileText,        letter: "W",   solidBg: "bg-[#185ABD]", bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400",     label: "Word" },
  excel:       { icon: FileSpreadsheet, letter: "E",   solidBg: "bg-[#107C41]", bg: "bg-green-100 dark:bg-green-950",   fg: "text-green-600 dark:text-green-400",   label: "Excel" },
  powerpoint:  { icon: Presentation,    letter: "P",   solidBg: "bg-[#C43E1C]", bg: "bg-orange-100 dark:bg-orange-950", fg: "text-orange-600 dark:text-orange-400", label: "PowerPoint" },
  pdf:         { icon: FileText,        letter: "PDF", solidBg: "bg-[#D62B1A]", bg: "bg-red-100 dark:bg-red-950",       fg: "text-red-600 dark:text-red-400",       label: "PDF" },
  onenote:     { icon: NotebookPen,     letter: "N",   solidBg: "bg-[#7719AA]", bg: "bg-purple-100 dark:bg-purple-950", fg: "text-purple-600 dark:text-purple-400", label: "OneNote" },
  visio:       { icon: LayoutDashboard, letter: "V",   solidBg: "bg-[#3955A3]", bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400",     label: "Visio" },
  publisher:   { icon: BookOpen,        letter: "Pb",  solidBg: "bg-[#077568]", bg: "bg-teal-100 dark:bg-teal-950",     fg: "text-teal-600 dark:text-teal-400",     label: "Publisher" },
  project:     { icon: LayoutDashboard, letter: "Pj",  solidBg: "bg-[#217346]", bg: "bg-green-100 dark:bg-green-950",   fg: "text-green-600 dark:text-green-400",   label: "Project" },
  access:      { icon: Database,        letter: "A",   solidBg: "bg-[#A4373A]", bg: "bg-red-100 dark:bg-red-950",       fg: "text-red-600 dark:text-red-400",       label: "Access" },
  infopath:    { icon: FileText,        letter: "I",   solidBg: "bg-[#B4295C]", bg: "bg-pink-100 dark:bg-pink-950",     fg: "text-pink-600 dark:text-pink-400",     label: "InfoPath" },
  csv:         { icon: FileSpreadsheet, letter: "E",   solidBg: "bg-[#107C41]", bg: "bg-green-100 dark:bg-green-950",   fg: "text-green-600 dark:text-green-400",   label: "CSV" },
  xps:         { icon: FileText,        letter: "XPS", solidBg: "bg-[#4A6785]", bg: "bg-slate-100 dark:bg-slate-950",   fg: "text-slate-600 dark:text-slate-400",   label: "XPS" },

  // ── SharePoint / Web ──
  web:         { icon: Globe,           letter: "SP",  solidBg: "bg-[#038387]", bg: "bg-teal-100 dark:bg-teal-950",     fg: "text-teal-600 dark:text-teal-400",     label: "Page" },
  spsite:      { icon: Globe,           letter: "SP",  solidBg: "bg-[#038387]", bg: "bg-teal-100 dark:bg-teal-950",     fg: "text-teal-600 dark:text-teal-400",     label: "Site" },

  // ── Media ──
  image:       { icon: FileImage,                      solidBg: "bg-[#CA64A6]", bg: "bg-pink-100 dark:bg-pink-950",     fg: "text-pink-600 dark:text-pink-400",     label: "Image" },
  video:       { icon: FileVideo,                      solidBg: "bg-[#6264A7]", bg: "bg-indigo-100 dark:bg-indigo-950", fg: "text-indigo-600 dark:text-indigo-400", label: "Video" },
  audio:       { icon: FileAudio,                      solidBg: "bg-[#6264A7]", bg: "bg-indigo-100 dark:bg-indigo-950", fg: "text-indigo-600 dark:text-indigo-400", label: "Audio" },

  // ── Other types ──
  mail:        { icon: Mail,            letter: "M",   solidBg: "bg-[#0078D4]", bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400",     label: "Mail" },
  folder:      { icon: Folder,                         solidBg: "bg-[#D4A017]", bg: "bg-amber-100 dark:bg-amber-950",   fg: "text-amber-600 dark:text-amber-400",   label: "Folder" },
  archive:     { icon: FileArchive,                    solidBg: "bg-[#7A6517]", bg: "bg-yellow-100 dark:bg-yellow-950", fg: "text-yellow-700 dark:text-yellow-400", label: "Archive" },
  text:        { icon: FileText,                       solidBg: "bg-gray-500",  bg: "bg-gray-100 dark:bg-gray-900",     fg: "text-gray-600 dark:text-gray-400",     label: "Text" },
  xml:         { icon: FileCode,                       solidBg: "bg-gray-600",  bg: "bg-gray-100 dark:bg-gray-900",     fg: "text-gray-600 dark:text-gray-400",     label: "XML" },
  code:        { icon: FileCode,                       solidBg: "bg-gray-600",  bg: "bg-gray-100 dark:bg-gray-900",     fg: "text-gray-600 dark:text-gray-400",     label: "Code" },
  story:       { icon: BookOpen,        letter: "Sw",  solidBg: "bg-[#008272]", bg: "bg-teal-100 dark:bg-teal-950",     fg: "text-teal-600 dark:text-teal-400",     label: "Sway" },
  external:    { icon: Cloud,                          solidBg: "bg-gray-500",  bg: "bg-gray-100 dark:bg-gray-900",     fg: "text-gray-600 dark:text-gray-400",     label: "External" },
  generic:     { icon: File,                           solidBg: "bg-gray-400 dark:bg-gray-700", bg: "bg-muted",         fg: "text-muted-foreground",                label: "File" },
};

/**
 * Detects file type from mimeType (including Graph Insights type strings)
 * and file name extension.
 *
 * Graph Insights `resourceVisualization.type` values:
 *   PowerPoint, Word, Excel, Pdf, OneNote, OneNotePage, InfoPath, Visio,
 *   Publisher, Project, Access, Mail, Csv, Archive, Xps, Audio, Video,
 *   Image, Web, Text, Xml, Story, ExternalContent, Folder, Spsite, Other
 *
 * @see https://learn.microsoft.com/en-us/graph/api/resources/insights-resourcevisualization
 */
export function getFileTypeInfo(mimeType?: string, name?: string): FileTypeInfo {
  const mt = (mimeType || "").toLowerCase().trim();

  // Extract extension properly — only if the name contains a dot
  const nameLower = (name || "").toLowerCase();
  const dotIndex = nameLower.lastIndexOf(".");
  const ext = dotIndex > 0 ? nameLower.slice(dotIndex + 1) : "";

  // ── 1) Exact match on Graph Insights type values ──
  const graphTypeMap: Record<string, FileTypeInfo> = {
    word: FILE_TYPES.word,
    excel: FILE_TYPES.excel,
    powerpoint: FILE_TYPES.powerpoint,
    pdf: FILE_TYPES.pdf,
    onenote: FILE_TYPES.onenote,
    onenotepage: FILE_TYPES.onenote,
    infopath: FILE_TYPES.infopath,
    visio: FILE_TYPES.visio,
    publisher: FILE_TYPES.publisher,
    project: FILE_TYPES.project,
    access: FILE_TYPES.access,
    mail: FILE_TYPES.mail,
    csv: FILE_TYPES.csv,
    archive: FILE_TYPES.archive,
    xps: FILE_TYPES.xps,
    audio: FILE_TYPES.audio,
    video: FILE_TYPES.video,
    image: FILE_TYPES.image,
    web: FILE_TYPES.web,
    text: FILE_TYPES.text,
    xml: FILE_TYPES.xml,
    story: FILE_TYPES.story,
    externalcontent: FILE_TYPES.external,
    folder: FILE_TYPES.folder,
    spsite: FILE_TYPES.spsite,
    other: FILE_TYPES.generic,
    // Common aliases
    "site page": FILE_TYPES.web,
    link: FILE_TYPES.web,
    zip: FILE_TYPES.archive,
  };

  if (graphTypeMap[mt]) return graphTypeMap[mt];

  // ── 2) Standard MIME type matching ──
  if (mt.includes("wordprocessing") || mt.includes("msword") || mt.includes(".document")) return FILE_TYPES.word;
  if (mt.includes("spreadsheet") || mt.includes("ms-excel")) return FILE_TYPES.excel;
  if (mt.includes("presentation") || mt.includes("ms-powerpoint") || mt.includes("powerpoint")) return FILE_TYPES.powerpoint;
  if (mt.includes("pdf")) return FILE_TYPES.pdf;
  if (mt.includes("onenote")) return FILE_TYPES.onenote;
  if (mt.includes("visio")) return FILE_TYPES.visio;
  if (mt.includes("publisher") || mt.includes("ms-publisher")) return FILE_TYPES.publisher;
  if (mt.includes("ms-project")) return FILE_TYPES.project;
  if (mt.includes("ms-access") || mt.includes("msaccess")) return FILE_TYPES.access;
  if (mt.includes("infopath")) return FILE_TYPES.infopath;
  if (mt.startsWith("image/")) return FILE_TYPES.image;
  if (mt.startsWith("video/")) return FILE_TYPES.video;
  if (mt.startsWith("audio/")) return FILE_TYPES.audio;
  if (mt.includes("zip") || mt.includes("archive") || mt.includes("compressed") || mt.includes("x-tar") || mt.includes("x-rar") || mt.includes("x-7z")) return FILE_TYPES.archive;
  if (mt.includes("csv")) return FILE_TYPES.csv;
  if (mt.includes("xps")) return FILE_TYPES.xps;
  if (mt.includes("json") || mt.includes("javascript") || mt.includes("typescript")) return FILE_TYPES.code;
  if (mt.includes("xml") || mt === "application/xml" || mt === "text/xml") return FILE_TYPES.xml;
  if (mt.includes("html") || mt.includes("css")) return FILE_TYPES.code;
  if (mt === "text/plain" || mt.startsWith("text/")) return FILE_TYPES.text;
  if (mt.startsWith("message/")) return FILE_TYPES.mail;

  // ── 3) File extension fallback ──
  if (ext) {
    const extMap: Record<string, FileTypeInfo> = {
      // Word
      doc: FILE_TYPES.word, docx: FILE_TYPES.word, odt: FILE_TYPES.word, rtf: FILE_TYPES.word, docm: FILE_TYPES.word,
      // Excel
      xls: FILE_TYPES.excel, xlsx: FILE_TYPES.excel, xlsm: FILE_TYPES.excel, xlsb: FILE_TYPES.excel, ods: FILE_TYPES.excel, csv: FILE_TYPES.csv,
      // PowerPoint
      ppt: FILE_TYPES.powerpoint, pptx: FILE_TYPES.powerpoint, pptm: FILE_TYPES.powerpoint, odp: FILE_TYPES.powerpoint,
      // PDF
      pdf: FILE_TYPES.pdf,
      // OneNote
      one: FILE_TYPES.onenote, onetoc2: FILE_TYPES.onenote,
      // Visio
      vsdx: FILE_TYPES.visio, vsd: FILE_TYPES.visio, vsdm: FILE_TYPES.visio,
      // Publisher
      pub: FILE_TYPES.publisher,
      // Project
      mpp: FILE_TYPES.project,
      // Access
      accdb: FILE_TYPES.access, mdb: FILE_TYPES.access,
      // InfoPath
      xsn: FILE_TYPES.infopath, infopathxml: FILE_TYPES.infopath,
      // XPS
      xps: FILE_TYPES.xps, oxps: FILE_TYPES.xps,
      // Image
      png: FILE_TYPES.image, jpg: FILE_TYPES.image, jpeg: FILE_TYPES.image, gif: FILE_TYPES.image,
      svg: FILE_TYPES.image, webp: FILE_TYPES.image, bmp: FILE_TYPES.image, ico: FILE_TYPES.image,
      tiff: FILE_TYPES.image, tif: FILE_TYPES.image, heic: FILE_TYPES.image,
      // Video
      mp4: FILE_TYPES.video, avi: FILE_TYPES.video, mov: FILE_TYPES.video, mkv: FILE_TYPES.video,
      webm: FILE_TYPES.video, wmv: FILE_TYPES.video, flv: FILE_TYPES.video, m4v: FILE_TYPES.video,
      // Audio
      mp3: FILE_TYPES.audio, wav: FILE_TYPES.audio, flac: FILE_TYPES.audio, aac: FILE_TYPES.audio,
      ogg: FILE_TYPES.audio, wma: FILE_TYPES.audio, m4a: FILE_TYPES.audio,
      // Archive
      zip: FILE_TYPES.archive, rar: FILE_TYPES.archive, "7z": FILE_TYPES.archive,
      tar: FILE_TYPES.archive, gz: FILE_TYPES.archive, tgz: FILE_TYPES.archive, bz2: FILE_TYPES.archive,
      // Code
      js: FILE_TYPES.code, ts: FILE_TYPES.code, jsx: FILE_TYPES.code, tsx: FILE_TYPES.code,
      json: FILE_TYPES.code, html: FILE_TYPES.code, css: FILE_TYPES.code,
      py: FILE_TYPES.code, java: FILE_TYPES.code, cs: FILE_TYPES.code, go: FILE_TYPES.code,
      rs: FILE_TYPES.code, sh: FILE_TYPES.code, yaml: FILE_TYPES.code, yml: FILE_TYPES.code,
      // XML
      xml: FILE_TYPES.xml, xsl: FILE_TYPES.xml, xslt: FILE_TYPES.xml,
      // Text / Markdown
      txt: FILE_TYPES.text, md: FILE_TYPES.text, log: FILE_TYPES.text,
      // Web pages
      aspx: FILE_TYPES.web, htm: FILE_TYPES.web,
      // Mail
      eml: FILE_TYPES.mail, msg: FILE_TYPES.mail,
    };

    if (extMap[ext]) return extMap[ext];
  }

  // ── 4) No extension + no mimeType → likely a SharePoint page ──
  if (!ext && !mt) return FILE_TYPES.web;

  return FILE_TYPES.generic;
}

// ============ File Origin Detection ============

export type FileOrigin = "onedrive" | "sharepoint" | "teams" | "dropbox" | "box" | "gdrive" | "unknown";

export const ORIGIN_CONFIG: Record<FileOrigin, { label: string; icon: LucideIcon }> = {
  onedrive:   { label: "OneDrive",    icon: HardDrive },
  sharepoint: { label: "SharePoint",  icon: Globe },
  teams:      { label: "Teams",       icon: Users },
  dropbox:    { label: "Dropbox",     icon: Droplet },
  box:        { label: "Box",         icon: Cloud },
  gdrive:     { label: "Google Drive", icon: Cloud },
  unknown:    { label: "Cloud",       icon: Cloud },
};

/**
 * Detects file origin from webUrl pattern or Graph containerType.
 * Pass containerType from resourceVisualization.containerType when available.
 */
export function detectFileOrigin(webUrl?: string, containerType?: string): FileOrigin {
  // Check containerType first (authoritative when available)
  if (containerType) {
    const ct = containerType.toLowerCase();
    if (ct === "onedrivebusiness" || ct === "onedrive") return "onedrive";
    if (ct === "site") return "sharepoint";
    if (ct === "mail") return "onedrive"; // mail attachments in user's context
    if (ct === "dropbox") return "dropbox";
    if (ct === "box") return "box";
    if (ct === "gdrive") return "gdrive";
  }

  // URL-based detection
  if (!webUrl) return "unknown";
  const url = webUrl.toLowerCase();
  if (url.includes("/personal/")) return "onedrive";
  if (url.includes("/sites/") && url.includes("/shared%20documents/general")) return "teams";
  if (url.includes("/sites/")) return "sharepoint";
  if (url.includes("sharepoint.com")) return "sharepoint";
  if (url.includes("dropbox.com")) return "dropbox";
  if (url.includes("box.com")) return "box";
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) return "gdrive";
  return "unknown";
}

// ============ Formatting ============

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
