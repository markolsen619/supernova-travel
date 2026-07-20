import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GenerateTripRequest, GeneratedTrip } from './types';
import { FREE_TIER_WEEKLY_AI_TRIP_LIMIT, getWeeklyQuotaKey } from './quotaUtils';

export const generateTrip = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false, timeoutSeconds: 180 },
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    // 2. Quota check for free tier
    const userDoc = await db.doc(`users/${uid}`).get();
    const tier = userDoc.data()?.tier ?? 'free';

    if (tier === 'free') {
      const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
      const quotaData = quotaDoc.data() ?? {};
      const weeklyCount = quotaData[getWeeklyQuotaKey()] ?? 0;
      if (weeklyCount >= FREE_TIER_WEEKLY_AI_TRIP_LIMIT) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Free tier limit: 1 AI trip per week. Upgrade to Pro for unlimited.'
        );
      }
    }

    // 3. Parse and validate input
    const data = request.data as GenerateTripRequest;
    if (!data.destination || !data.durationDays) {
      throw new functions.https.HttpsError('invalid-argument', 'destination and durationDays are required');
    }

    // 4. Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new functions.https.HttpsError('internal', 'Gemini API key not configured');
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = buildPrompt(data);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 5. Parse JSON from Gemini response
    let generated: GeneratedTrip;
    try {
      // Gemini sometimes wraps JSON in ```json ... ``` — strip it
      const jsonStr = text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
      generated = JSON.parse(jsonStr);
    } catch {
      throw new functions.https.HttpsError('internal', 'Failed to parse Gemini response as JSON');
    }

    // 6. Write to Firestore
    const now = admin.firestore.FieldValue.serverTimestamp();
    const tripRef = db.collection('trips').doc();

    const tripData = {
      authorUid: uid,
      title: generated.title,
      description: generated.description,
      coverImageUrl: null,
      destination: {
        name: data.destination,
        placeId: null,
        lat: null,
        lng: null,
        countryCode: data.countryCode || null,
      },
      startDate: data.startDate ? admin.firestore.Timestamp.fromDate(new Date(data.startDate)) : null,
      endDate: data.endDate ? admin.firestore.Timestamp.fromDate(new Date(data.endDate)) : null,
      visibility: 'private' as const,
      collaborators: [],
      isAiGenerated: true,
      status: 'planning' as const,
      tags: [],
      likesCount: 0,
      savesCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await tripRef.set(tripData);

    // Write days and activities using batch
    const batch = db.batch();
    for (const day of generated.days) {
      const dayRef = tripRef.collection('days').doc();
      batch.set(dayRef, {
        dayNumber: day.dayNumber,
        date: null,
        title: day.title,
        notes: day.notes,
        createdAt: now,
      });

      day.activities.forEach((act, idx) => {
        const actRef = dayRef.collection('activities').doc();
        batch.set(actRef, {
          type: act.type,
          title: act.title,
          // Ungrounded at generation time — no billed Places call here. The
          // client resolves searchQuery lazily on first interaction with this
          // stop (see enrichPlaceByQuery in services/places/googlePlaces.ts).
          placeId: null,
          address: act.address,
          lat: null,
          lng: null,
          startTime: act.startTime,
          endTime: act.endTime,
          durationMinutes: null,
          // rationale is a distinct field in Gemini's output (why this stop
          // fits the traveler) but TripActivity has no dedicated column for
          // it, so it's folded into notes rather than adding a second field.
          notes: [act.rationale, act.notes].filter(Boolean).join(' — '),
          bookingRef: null,
          cost: act.cost,
          currency: act.currency,
          mediaUrls: [],
          order: idx * 1000,
          createdAt: now,
          searchQuery: act.searchQuery,
        });
      });
    }
    await batch.commit();

    // 7. Update quota for free tier
    if (tier === 'free') {
      await db.doc(`usage_quotas/${uid}`).set(
        { [getWeeklyQuotaKey()]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
    }

    return { tripId: tripRef.id };
  }
);

const PACE_RULES: Record<GenerateTripRequest['pace'], string> = {
  relaxed: '2-3 activities per day, generous downtime between stops, nothing before 9am',
  moderate: '3-5 activities per day, a balanced mix of activity and rest',
  packed: '5-7 activities per day, tightly scheduled, see as much as possible',
};

const STYLE_RULES: Record<GenerateTripRequest['travelStyle'], string> = {
  adventure: 'Prioritize outdoor and active experiences (hiking, water sports, nature, thrill activities) over museums or shopping.',
  luxury: 'Favor fine dining, premium/private experiences, and upscale venues. Avoid budget language like "cheap" or "free walking tour".',
  budget: 'Favor free or low-cost activities, casual local eateries, and public transport. Avoid luxury/fine-dining language.',
  family: 'Favor kid-friendly venues and gentler pacing (shorter walks, earlier bedtimes, no late-night or adult-oriented activities).',
  cultural: 'Prioritize museums, historic sites, and local traditions over shopping, nightlife, or generic tourist attractions.',
};

function buildPrompt(data: GenerateTripRequest): string {
  const mustSeeStr =
    data.mustSee.length > 0
      ? `Must-see (each one of these MUST appear as its own activity somewhere in the itinerary): ${data.mustSee.join(', ')}.`
      : '';
  const prefStr = data.preferences ? `Additional preferences: ${data.preferences}.` : '';

  return `Create a ${data.durationDays}-day ${data.travelStyle}-style travel itinerary for ${data.destination}, paced for a "${data.pace}" traveler.

Pace rule for this trip: ${PACE_RULES[data.pace]}
Travel style rule for this trip: ${STYLE_RULES[data.travelStyle]}
${mustSeeStr}
${prefStr}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "title": "Trip title",
  "description": "2-3 sentence trip overview",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day theme title",
      "notes": "Brief day overview",
      "activities": [
        {
          "type": "hotel|flight|restaurant|activity|transport|free",
          "title": "Activity name",
          "address": "Best-guess one-line address or null — this is NOT verified, so approximate is fine",
          "rationale": "One sentence on why this stop fits this traveler's style/pace/preferences",
          "searchQuery": "A specific, geographically-qualified search string for this place, e.g. 'Louvre Museum, Paris' — this is the ONLY place-identifying field you may output",
          "startTime": "09:00 or null",
          "endTime": "11:00 or null",
          "notes": "Brief description",
          "cost": 25 or null,
          "currency": "USD or null"
        }
      ]
    }
  ]
}

Rules:
- Follow the pace rule above for how many activities to include per day — do not default to a generic count
- Follow the travel style rule above — the itinerary should look visibly different for a different style/pace than this one
- Mix activity types naturally
- Use local currency for costs
- Include at least one meal per day
- Start day 1 with hotel check-in if multi-day
- Return exactly ${data.durationDays} days
- CRITICAL: never output a Google placeId or any other place identifier — searchQuery must be a plain human-readable search string, not an ID. Real places are resolved separately after generation.`;
}
