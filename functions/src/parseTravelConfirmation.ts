import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParseTravelConfirmationRequest, ParseTravelConfirmationResult } from './types';
import { FREE_TIER_YEARLY_IMPORT_LIMIT, getYearlyQuotaKey } from './quotaUtils';

function buildExtractionPrompt(): string {
  return `You are reading a travel booking confirmation (flight, hotel, car rental, restaurant, or event
reservation). It may be pasted email text and/or a photo of a printed confirmation or a screenshot.

First, decide what kind of thing this is:
- A flight boarding pass or flight confirmation → "boarding_pass"
- Anything else (hotel, Airbnb, rental car, restaurant, activity/tour, show/concert/theater) → "reservation",
  and pick the single closest reservationType: "hotel", "airbnb", "rental_car", "restaurant", "activity", or "show"

Then extract every field you can confidently find. Do NOT guess or make up a value for a field you can't
find with reasonable confidence — omit that key entirely rather than fill it with a placeholder.

Return ONLY valid JSON in one of these two exact formats (no markdown, no explanation):

For a boarding pass:
{
  "kind": "boarding_pass",
  "fields": {
    "airline": "Delta Air Lines",
    "flightNumber": "DL405",
    "origin": "JFK",
    "originCity": "New York",
    "destination": "LHR",
    "destinationCity": "London",
    "departureTime": "2026-08-15T18:30:00.000Z",
    "arrivalTime": "2026-08-16T06:45:00.000Z",
    "seat": "14A",
    "boardingGroup": "3",
    "gate": "B22",
    "terminal": "4"
  }
}

For a reservation:
{
  "kind": "reservation",
  "reservationType": "hotel",
  "fields": {
    "title": "The Ritz-Carlton, Tokyo",
    "confirmationCode": "RT4821",
    "checkIn": "2026-08-15T00:00:00.000Z",
    "checkOut": "2026-08-18T00:00:00.000Z",
    "address": "9 Chome-7-1 Ginzaa, Tokyo",
    "notes": "Any other relevant detail worth keeping, e.g. room type or special requests"
  }
}

Rules:
- "fields" only contains keys you actually found — omit anything not confidently present in the source
- origin/destination airport codes are 3-letter IATA codes
- All date/time fields are ISO 8601 strings
- flightNumber and origin/destination are uppercase
- If you truly cannot identify what kind of booking this is at all, return {"kind": "reservation", "reservationType": "activity", "fields": {}}`;
}

export const parseTravelConfirmation = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false, timeoutSeconds: 60 },
  async (request): Promise<ParseTravelConfirmationResult> => {
    // 1. Auth check
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    // 2. Validate input
    const data = request.data as ParseTravelConfirmationRequest;
    if (!data.text?.trim() && !data.imageBase64) {
      throw new functions.https.HttpsError('invalid-argument', 'text or imageBase64 is required');
    }
    if (data.imageBase64 && !data.imageMimeType) {
      throw new functions.https.HttpsError('invalid-argument', 'imageMimeType is required when imageBase64 is present');
    }

    // 3. Quota check for free tier — 1 per calendar year, not a recurring allowance
    const userDoc = await db.doc(`users/${uid}`).get();
    const tier = userDoc.data()?.tier ?? 'free';

    if (tier === 'free') {
      const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
      const quotaData = quotaDoc.data() ?? {};
      const yearlyCount = quotaData[getYearlyQuotaKey('wallet_imports')] ?? 0;
      if (yearlyCount >= FREE_TIER_YEARLY_IMPORT_LIMIT) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Free tier limit: 1 wallet import per year. Upgrade to Pro for unlimited.'
        );
      }
    }

    // 4. Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new functions.https.HttpsError('internal', 'Gemini API key not configured');
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildExtractionPrompt() },
    ];
    if (data.text?.trim()) {
      parts.push({ text: `Confirmation text:\n${data.text.trim()}` });
    }
    if (data.imageBase64 && data.imageMimeType) {
      parts.push({ inlineData: { mimeType: data.imageMimeType, data: data.imageBase64 } });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();

    // 5. Parse JSON from Gemini response
    let parsed: ParseTravelConfirmationResult;
    try {
      const jsonStr = text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new functions.https.HttpsError('internal', 'Failed to parse Gemini response as JSON');
    }

    // 6. Update quota for free tier
    if (tier === 'free') {
      await db.doc(`usage_quotas/${uid}`).set(
        { [getYearlyQuotaKey('wallet_imports')]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
    }

    return parsed;
  }
);
