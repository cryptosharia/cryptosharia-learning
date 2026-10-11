import * as env from '$env/static/public';
import { resolveAcademyFirebaseSettings, requireFirebaseServices } from './firebaseConfig';
import { initializeFirebaseClient } from './firebaseClient';

export const firebaseSettings = resolveAcademyFirebaseSettings(env);
export const { auth, db, lessonDb } = initializeFirebaseClient(firebaseSettings);
export const ensureFirebaseReady = () => requireFirebaseServices(firebaseSettings);
