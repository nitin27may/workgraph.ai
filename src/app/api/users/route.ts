import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  isAdmin,
  getAllAuthorizedUsers,
  addAuthorizedUser,
  updateAuthorizedUser,
  deleteAuthorizedUser,
  getUserByEmail,
  exportUsersToCsv,
  importUsersFromCsv,
} from "@/lib/db";
import { createUserSchema, updateUserSchema, parseBody } from "@/lib/validations";

// GET /api/users - Get all authorized users (admin only)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can access
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  // Export as CSV
  if (format === "csv") {
    const csv = exportUsersToCsv();
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="authorized-users-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  try {
    const users = getAllAuthorizedUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST /api/users - Add a new authorized user or import CSV (admin only)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can access
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    
    // Handle CSV import
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      
      const csvContent = await file.text();
      const result = importUsersFromCsv(csvContent, session.user.email);
      
      return NextResponse.json({
        message: `Imported ${result.imported} users, skipped ${result.skipped} existing`,
        ...result,
      });
    }
    
    // Handle single user add
    const body = await request.json();
    const parsed = parseBody(createUserSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { email, name, role } = parsed.data;

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    const user = addAuthorizedUser(email, name, role, session.user.email);
    return NextResponse.json({ 
      message: "User added successfully",
      user 
    });
  } catch (error) {
    console.error("Error adding user:", error);
    return NextResponse.json(
      { error: "Failed to add user" },
      { status: 500 }
    );
  }
}

// PATCH /api/users - Update an authorized user (admin only)
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can access
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = parseBody(updateUserSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { id, name, role, isActive } = parsed.data;

    const success = updateAuthorizedUser(id, { name, role, isActive });
    if (success) {
      return NextResponse.json({ message: "User updated successfully" });
    }
    return NextResponse.json({ error: "User not found or no changes made" }, { status: 404 });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/users - Delete an authorized user (admin only)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can access
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  try {
    const success = deleteAuthorizedUser(parseInt(id));
    if (success) {
      return NextResponse.json({ message: "User deleted successfully" });
    }
    return NextResponse.json({ error: "User not found or cannot be deleted" }, { status: 404 });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
