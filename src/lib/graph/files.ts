import { getGraphClient } from "./client";

// ============ Document Discovery Types ============

export type DocumentSource = "trending" | "used" | "shared" | "search" | "recent";

export interface InsightResource {
  id: string;
  webUrl: string;
  type?: string;
}

export interface DiscoveredDocument {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime?: string;
  size?: number;
  mimeType?: string;
  owner?: string;
  containerName?: string;
  /** Graph containerType: OneDriveBusiness, Site, Mail, DropBox, Box, GDrive */
  containerType?: string;
  source: DocumentSource;
}

export interface GraphSearchHit {
  hitId: string;
  rank: number;
  summary?: string;
  resource: {
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime?: string;
    size?: number;
    file?: { mimeType: string };
    createdBy?: { user?: { displayName: string } };
    parentReference?: { name?: string; siteId?: string };
  };
}

// ============ Normalization Helpers ============

export function normalizeInsightToDocument(
  insight: any,
  source: DocumentSource
): DiscoveredDocument | null {
  const resource = insight.resourceReference || {};
  const resourceVisualization = insight.resourceVisualization || {};

  if (!resource.id && !resource.webUrl) return null;

  return {
    id: resource.id || resourceVisualization.title || "",
    name: resourceVisualization.title || "Untitled",
    webUrl: resource.webUrl || "",
    lastModifiedDateTime: undefined,
    size: undefined,
    mimeType: resourceVisualization.type || resourceVisualization.mediaType || undefined,
    owner: undefined,
    containerName: resourceVisualization.containerDisplayName || undefined,
    containerType: resourceVisualization.containerType || undefined,
    source,
  };
}

export function normalizeDriveItemToDocument(
  item: DriveItem,
  source: DocumentSource = "recent"
): DiscoveredDocument {
  return {
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    size: item.size,
    mimeType: item.file?.mimeType || undefined,
    owner: item.createdBy?.user?.displayName || undefined,
    containerName: undefined,
    source,
  };
}

export function normalizeSearchHitToDocument(hit: GraphSearchHit): DiscoveredDocument {
  const r = hit.resource;
  return {
    id: r.id || hit.hitId,
    name: r.name || "Untitled",
    webUrl: r.webUrl || "",
    lastModifiedDateTime: r.lastModifiedDateTime,
    size: r.size,
    mimeType: r.file?.mimeType || undefined,
    owner: r.createdBy?.user?.displayName || undefined,
    containerName: r.parentReference?.name || undefined,
    source: "search",
  };
}

export function deduplicateDocuments(docs: DiscoveredDocument[]): DiscoveredDocument[] {
  const sourcePriority: Record<DocumentSource, number> = {
    trending: 1,
    shared: 2,
    search: 3,
    used: 4,
    recent: 5,
  };

  const seen = new Map<string, DiscoveredDocument>();
  for (const doc of docs) {
    const key = doc.webUrl || doc.id;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || sourcePriority[doc.source] < sourcePriority[existing.source]) {
      seen.set(key, doc);
    }
  }
  return Array.from(seen.values());
}

// ============ Insight API Functions ============

export async function getTrendingDocuments(
  accessToken: string,
  top: number = 50
): Promise<DiscoveredDocument[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/insights/trending")
      .top(top)
      .get();

    return (response.value || [])
      .map((item: any) => normalizeInsightToDocument(item, "trending"))
      .filter((d: DiscoveredDocument | null): d is DiscoveredDocument => d !== null);
  } catch (error) {
    console.error("Error fetching trending documents:", error);
    return [];
  }
}

export async function getUsedDocuments(
  accessToken: string,
  top: number = 50
): Promise<DiscoveredDocument[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/insights/used")
      .top(top)
      .get();

    return (response.value || [])
      .map((item: any) => normalizeInsightToDocument(item, "used"))
      .filter((d: DiscoveredDocument | null): d is DiscoveredDocument => d !== null)
      // Filter out web bookmarks - only keep actual documents
      .filter((d: DiscoveredDocument) => {
        const mimeType = d.mimeType?.toLowerCase() || "";
        return !mimeType.includes("bookmark") && !mimeType.includes("link");
      });
  } catch (error) {
    console.error("Error fetching used documents:", error);
    return [];
  }
}

export async function getSharedDocuments(
  accessToken: string,
  top: number = 50
): Promise<DiscoveredDocument[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/insights/shared")
      .top(top)
      .get();

    return (response.value || [])
      .map((item: any) => normalizeInsightToDocument(item, "shared"))
      .filter((d: DiscoveredDocument | null): d is DiscoveredDocument => d !== null);
  } catch (error) {
    console.error("Error fetching shared documents:", error);
    return [];
  }
}

export async function searchGraphContent(
  accessToken: string,
  query: string,
  options?: { top?: number; entityTypes?: string[] }
): Promise<DiscoveredDocument[]> {
  const client = getGraphClient(accessToken);
  const top = options?.top ?? 25;
  const entityTypes = options?.entityTypes ?? ["driveItem", "listItem"];

  if (!query.trim()) return [];

  try {
    const response = await client
      .api("/search/query")
      .post({
        requests: [
          {
            entityTypes,
            query: { queryString: query },
            from: 0,
            size: top,
          },
        ],
      });

    const hits: DiscoveredDocument[] = [];
    for (const result of response.value || []) {
      for (const hitContainer of result.hitsContainers || []) {
        for (const hit of hitContainer.hits || []) {
          const doc = normalizeSearchHitToDocument(hit);
          hits.push(doc);
        }
      }
    }
    return hits;
  } catch (error) {
    console.error("Error searching graph content:", error);
    return [];
  }
}

// ============ Existing Types ============

export interface DriveItem {
  id: string;
  name: string;
  size: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id: string; path: string };
  createdBy?: { user: { displayName: string } };
  lastModifiedBy?: { user: { displayName: string } };
}

export interface Drive {
  id: string;
  driveType: string;
  name?: string;
  owner: { user: { displayName: string } };
  quota?: {
    total: number;
    used: number;
    remaining: number;
    deleted: number;
    state: string;
  };
}

// Get root drive
export async function getDrive(accessToken: string): Promise<Drive> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api("/me/drive").get();
  } catch (error) {
    console.error("Error fetching drive:", error);
    throw new Error("Failed to fetch drive");
  }
}

// List files in root
export async function getDriveRootChildren(
  accessToken: string,
  top: number = 100
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api("/me/drive/root/children")
      .top(top)
      .orderby("lastModifiedDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching root children:", error);
    throw new Error("Failed to fetch files");
  }
}

// Get file/folder by path
export async function getDriveItemByPath(
  accessToken: string,
  path: string
): Promise<DriveItem | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/drive/root:/${path}`).get();
  } catch (error) {
    console.error("Error fetching drive item by path:", error);
    return null;
  }
}

// List children of a folder by path
export async function getDriveItemChildrenByPath(
  accessToken: string,
  path: string,
  top: number = 100
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root:/${path}:/children`)
      .top(top)
      .orderby("lastModifiedDateTime desc")
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error fetching folder children:", error);
    throw new Error("Failed to fetch folder contents");
  }
}

// Get file by ID
export async function getDriveItem(
  accessToken: string,
  itemId: string
): Promise<DriveItem | null> {
  const client = getGraphClient(accessToken);

  try {
    return await client.api(`/me/drive/items/${itemId}`).get();
  } catch (error) {
    console.error("Error fetching drive item:", error);
    return null;
  }
}

// Download file content (returns URL for download)
export async function getDriveItemDownloadUrl(
  accessToken: string,
  itemId: string
): Promise<string | null> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api(`/me/drive/items/${itemId}`).get();
    return response["@microsoft.graph.downloadUrl"] || null;
  } catch (error) {
    console.error("Error fetching download URL:", error);
    return null;
  }
}

// Search files
export async function searchDriveItems(
  accessToken: string,
  query: string,
  top: number = 50
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client
      .api(`/me/drive/root/search(q='${encodeURIComponent(query)}')`)
      .top(top)
      .get();

    return response.value || [];
  } catch (error) {
    console.error("Error searching drive items:", error);
    throw new Error("Failed to search files");
  }
}

// Get recent files
export async function getRecentFiles(
  accessToken: string,
  top: number = 25
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/drive/recent").top(top).get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching recent files:", error);
    throw new Error("Failed to fetch recent files");
  }
}

// Get shared files
export async function getSharedFiles(
  accessToken: string,
  top: number = 50
): Promise<DriveItem[]> {
  const client = getGraphClient(accessToken);

  try {
    const response = await client.api("/me/drive/sharedWithMe").top(top).get();
    return response.value || [];
  } catch (error) {
    console.error("Error fetching shared files:", error);
    throw new Error("Failed to fetch shared files");
  }
}

// Create folder
export async function createFolder(
  accessToken: string,
  folderName: string,
  parentPath?: string
): Promise<DriveItem> {
  const client = getGraphClient(accessToken);

  try {
    const endpoint = parentPath
      ? `/me/drive/root:/${parentPath}:/children`
      : "/me/drive/root/children";

    return await client.api(endpoint).post({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    throw new Error("Failed to create folder");
  }
}

// Delete file or folder
export async function deleteDriveItem(
  accessToken: string,
  itemId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  try {
    await client.api(`/me/drive/items/${itemId}`).delete();
  } catch (error) {
    console.error("Error deleting drive item:", error);
    throw new Error("Failed to delete item");
  }
}
