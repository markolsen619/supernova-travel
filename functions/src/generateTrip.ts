import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GenerateTripRequest, GeneratedTrip } from './types';

export const generateTrip = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
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
      const weekStart = getWeekStart();
      const weekKey = weekStart.toISOString().split('T')[0];
      const weeklyCount = quotaData[`ai_trips_${weekKey}`] ?? 0;
      if (weeklyCount >= 1) {
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
          placeId: null,
          address: act.address,
          lat: null,
          lng: null,
          startTime: act.startTime,
          endTime: act.endTime,
          durationMinutes: null,
          notes: act.notes,
          bookingRef: null,
          cost: act.cost,
          currency: act.currency,
          mediaUrls: [],
          order: idx * 1000,
          createdAt: now,
        });
      });
    }
    await batch.commit();

    // 7. Update quota for free tier
    if (tier === 'free') {
      const weekStart = getWeekStart();
      const weekKey = weekStart.toISOString().split('T')[0];
      await db.doc(`usage_quotas/${uid}`).set(
        { [`ai_trips_${weekKey}`]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
    }

    return { tripId: tripRef.id };
  }
);

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

function buildPrompt(data: GenerateTripRequest): string {
  const mustSeeStr = data.mustSee.length > 0 ? `Must-see: ${data.mustSee.join(', ')}.` : '';
  const prefStr = data.preferences ? `Preferences: ${data.preferences}.` : '';

  return `Create a ${data.durationDays}-day ${data.travelStyle} travel itinerary for ${data.destination}.
${mustSeeStr} ${prefStr}

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
          "address": "Full address or null",
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
- Include 3-6 activities per day
- Mix activity types naturally
- Use local currency for costs
- Include at least one meal per day
- Start day 1 with hotel check-in if multi-day
- Return exactly ${data.durationDays} days`;
}
