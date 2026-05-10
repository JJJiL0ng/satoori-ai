import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getAdminDb()
    .collection("items")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const items = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; content?: string };

    if (!body.title) {
      return NextResponse.json(
        { error: "title이 필요합니다." },
        { status: 400 }
      );
    }

    const docRef = await getAdminDb().collection("items").add({
      title: body.title,
      content: body.content ?? "",
      createdAt: new Date(),
    });

    return NextResponse.json({ id: docRef.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
