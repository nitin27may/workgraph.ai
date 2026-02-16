import { getGraphClient } from "./client";

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
