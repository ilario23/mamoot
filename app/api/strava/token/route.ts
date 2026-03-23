import { NextRequest, NextResponse } from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {
  applyStravaTokenPayloadToResponse,
  postStravaOAuthToken,
  refreshStravaTokensFromRequest,
} from "@/lib/stravaTokenBroker";

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? "";

const reconcileLegacyRowsForAthlete = async (athleteId: number) => {
  const db = getDb();
  await db.execute(sql`
    UPDATE activities
    SET athlete_id = ${athleteId}
    WHERE athlete_id = 0
      AND COALESCE(NULLIF(data->'athlete'->>'id', '')::bigint, 0) = ${athleteId}
  `);

  await db.execute(sql`
    UPDATE activity_details
    SET athlete_id = ${athleteId}
    WHERE athlete_id = 0
      AND COALESCE(NULLIF(data->'athlete'->>'id', '')::bigint, 0) = ${athleteId}
  `);

  await db.execute(sql`
    UPDATE activity_streams s
    SET athlete_id = a.athlete_id
    FROM activities a
    WHERE s.athlete_id = 0
      AND a.id = s.activity_id
      AND a.athlete_id = ${athleteId}
  `);

  await db.execute(sql`
    UPDATE activity_labels l
    SET athlete_id = a.athlete_id
    FROM activities a
    WHERE l.athlete_id = 0
      AND a.id = l.id
      AND a.athlete_id = ${athleteId}
  `);

  await db.execute(sql`
    UPDATE zone_breakdowns z
    SET athlete_id = a.athlete_id
    FROM activities a
    WHERE z.athlete_id = 0
      AND a.id = z.activity_id
      AND a.athlete_id = ${athleteId}
  `);

  await db.execute(sql`
    INSERT INTO athlete_zones (key, athlete_id, data, fetched_at)
    SELECT ${`athlete-zones:${athleteId}`}, ${athleteId}, data, fetched_at
    FROM athlete_zones
    WHERE key = 'athlete-zones'
      AND NOT EXISTS (
        SELECT 1 FROM athlete_zones existing WHERE existing.athlete_id = ${athleteId}
      )
    ON CONFLICT (key) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO athlete_gear (key, athlete_id, bikes, shoes, retired_gear_ids, fetched_at)
    SELECT ${`athlete-gear:${athleteId}`}, ${athleteId}, bikes, shoes, retired_gear_ids, fetched_at
    FROM athlete_gear
    WHERE key = 'athlete-gear'
      AND NOT EXISTS (
        SELECT 1 FROM athlete_gear existing WHERE existing.athlete_id = ${athleteId}
      )
    ON CONFLICT (key) DO NOTHING
  `);
};

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

  if (body.grant_type === "refresh_token") {
    const result = await refreshStravaTokensFromRequest(request, body.refresh_token);
    if (!result.ok) {
      return new NextResponse(result.bodyText, {
        status: result.status,
        headers: {"Content-Type": "application/json"},
      });
    }
    const response = new NextResponse(result.bodyText, {
      status: result.status,
      headers: {"Content-Type": "application/json"},
    });
    applyStravaTokenPayloadToResponse(response, result.parsed);
    return response;
  }

  if (body.grant_type !== "authorization_code") {
    return NextResponse.json({error: "Unsupported grant_type"}, {status: 400});
  }

  formData.set("code", body.code);

  try {
    const {status, bodyText: data} = await postStravaOAuthToken(formData);

    if (status >= 200 && status < 300 && body.grant_type === "authorization_code") {
      try {
        const parsed = JSON.parse(data) as {athlete?: {id?: number}};
        const athleteId = parsed.athlete?.id;
        if (typeof athleteId === "number" && Number.isFinite(athleteId)) {
          await reconcileLegacyRowsForAthlete(athleteId);
        }
      } catch {
        // Non-blocking: token exchange succeeded even if reconciliation fails.
      }
    }

    const response = new NextResponse(data, {
      status,
      headers: {"Content-Type": "application/json"},
    });
    if (status >= 200 && status < 300) {
      try {
        const parsed = JSON.parse(data) as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          athlete?: unknown;
        };
        applyStravaTokenPayloadToResponse(response, parsed);
      } catch {
        // No-op if response body is not JSON.
      }
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to contact Strava" },
      { status: 500 }
    );
  }
}
