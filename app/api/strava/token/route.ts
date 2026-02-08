import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? "";

export async function POST(request: NextRequest) {
  let body: Record<string, string>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const formData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: body.grant_type,
  });

  if (body.grant_type === "authorization_code") {
    formData.set("code", body.code);
  } else if (body.grant_type === "refresh_token") {
    formData.set("refresh_token", body.refresh_token);
  }

  try {
    const stravaRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await stravaRes.text();

    return new NextResponse(data, {
      status: stravaRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to contact Strava" },
      { status: 500 }
    );
  }
}
