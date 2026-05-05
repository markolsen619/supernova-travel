import * as admin from 'firebase-admin';

admin.initializeApp();

export { generateTrip } from './generateTrip';
export { checkFlightStatus } from './checkFlightStatus';
export { syncTripToAlgolia, syncUserToAlgolia } from './syncAlgolia';
