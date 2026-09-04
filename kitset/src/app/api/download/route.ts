import fs from "node:fs";
import { NextResponse } from "next/server";
import { verifyPurchase } from "@/lib/fulfilment";
import { getDownloadPath } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * Serves a bought file.
 *
 * The payment is checked here as well as on the delivery page, so a copied
 * file link is worth nothing on its own. Only files listed in that bot's
 * bot.json can be asked for, so a made-up file name reaches nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await verifyPurchase(url.searchParams.get("session_id"));

  if (!result.ok) {
    return new NextResponse("No completed payment is attached to this link.", {
      status: 403,
    });
  }

  const file = url.searchParams.get("file") ?? "";
  const filePath = getDownloadPath(result.bot.slug, file);
  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse("That file is not part of this purchase.", {
      status: 404,
    });
  }

  const body = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
