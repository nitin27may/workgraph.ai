import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUserAuthorized, isAdmin } from "@/lib/db";

// GET /api/auth/check - Check if current user is authorized
export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return NextResponse.json({ 
      authorized: false, 
      isAdmin: false,
      reason: "Not authenticated" 
    }, { status: 401 });
  }

  const { authorized, user, isAdmin: userIsAdmin } = isUserAuthorized(session.user.email);
  
  if (!authorized) {
    return NextResponse.json({ 
      authorized: false, 
      isAdmin: false,
      reason: "Not authorized to use this application",
      email: session.user.email
    }, { status: 403 });
  }

  return NextResponse.json({
    authorized: true,
    isAdmin: userIsAdmin,
    user: {
      email: session.user.email,
      name: session.user.name,
      role: user?.role || (isAdmin(session.user.email) ? 'admin' : 'user'),
    }
  });
}
